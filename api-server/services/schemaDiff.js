import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { pool } from '../../db/index.js';
import { splitSqlStatements } from './generatedSql.js';

const projectRoot = process.cwd();

async function commandExists(cmd) {
  try {
    await runCommand('which', [cmd], { captureStdout: false, captureStderr: false });
    return true;
  } catch {
    return false;
  }
}

export async function getSchemaDiffPrerequisites() {
  const [mysqldumpAvailable, mysqldbcompareAvailable, mysqlAvailable] = await Promise.all([
    commandExists('mysqldump'),
    commandExists('mysqldbcompare'),
    commandExists('mysql'),
  ]);
  const env = {
    DB_NAME: Boolean(process.env.DB_NAME),
    DB_USER: Boolean(process.env.DB_USER),
    DB_PASS: Boolean(process.env.DB_PASS),
    DB_HOST: Boolean(process.env.DB_HOST),
  };
  const missing = [];
  if (!mysqldumpAvailable) missing.push('mysqldump');
  if (!env.DB_NAME) missing.push('DB_NAME');

  return {
    mysqldumpAvailable,
    mysqldbcompareAvailable,
    mysqlAvailable,
    env,
    missing,
  };
}

function runCommand(command, args, options = {}) {
  const {
    cwd,
    env,
    signal,
    stdinFilePath,
    captureStdout = true,
    captureStderr = true,
  } = options;
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', captureStdout ? 'pipe' : 'ignore', captureStderr ? 'pipe' : 'ignore'],
    });

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      child.kill('SIGTERM');
      const abortErr = new Error(`${command} aborted`);
      abortErr.name = 'AbortError';
      abortErr.aborted = true;
      cleanup();
      reject(abortErr);
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    if (captureStdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (captureStderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    if (stdinFilePath) {
      const stream = fs.createReadStream(stdinFilePath);
      stream.on('error', (err) => {
        child.kill('SIGTERM');
        cleanup();
        reject(err);
      });
      stream.pipe(child.stdin);
    } else if (child.stdin) {
      child.stdin.end();
    }

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });

    child.on('close', (code) => {
      cleanup();
      if (code === 0 || code === null) {
        resolve({ stdout, stderr, code: code ?? 0 });
      } else {
        const err = new Error(`${command} exited with code ${code}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

function resolveSchemaFile({ schemaPath, schemaFile }) {
  const combined = schemaFile
    ? path.join(schemaPath || '.', schemaFile)
    : schemaPath;
  if (!combined) {
    const err = new Error('schemaPath or schemaFile is required');
    err.status = 400;
    throw err;
  }
  const resolved = path.resolve(projectRoot, combined);
  if (!resolved.startsWith(projectRoot)) {
    const err = new Error('Schema path must stay within the repository root');
    err.status = 400;
    throw err;
  }
  return resolved;
}

async function dumpCurrentSchema(outputPath, signal) {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || '';
  const pass = process.env.DB_PASS || '';
  const dbName = process.env.DB_NAME;
  const port = process.env.DB_PORT;
  if (!dbName) {
    const err = new Error('DB_NAME env is required to dump schema');
    err.status = 500;
    throw err;
  }
  const args = ['--no-data', '--routines', '--triggers', '--events', '-h', host];
  if (port) args.push('--port', String(port));
  if (user) args.push('-u', user);
  args.push(dbName);
  const env = { ...process.env };
  if (pass) env.MYSQL_PWD = pass;
  try {
    const { stdout } = await runCommand('mysqldump', args, { env, signal });
    await fsPromises.writeFile(outputPath, stdout, 'utf8');
    return { outputPath, sql: stdout };
  } catch (err) {
    if (err.aborted) {
      err.status = err.status || 499;
      err.message = err.message || 'mysqldump aborted by abort signal';
    } else {
      err.status = err.status || 500;
      const stderrMsg = err.stderr?.trim();
      err.message = stderrMsg ? `mysqldump failed: ${stderrMsg}` : err.message || 'mysqldump failed';
    }
    err.details = err.details || { code: err.code, stderr: err.stderr, stdout: err.stdout };
    throw err;
  }
}

function stripCommentLines(sqlText) {
  return sqlText
    .split(/\r?\n/)
    .filter((line) => !/^\s*(#|--)/.test(line))
    .join('\n')
    .trim();
}

function extractTableName(statement) {
  const tableMatch = statement.match(
    /\b(?:TABLE|VIEW)\s+`?([A-Za-z0-9_]+)`?/i,
  );
  if (tableMatch) return tableMatch[1];
  const triggerMatch = statement.match(/\bTRIGGER\s+`?([A-Za-z0-9_]+)`?/i);
  if (triggerMatch) return triggerMatch[1];
  return null;
}

function classifyStatement(statement) {
  const trimmed = statement.trim().toUpperCase();
  if (trimmed.startsWith('DROP ')) return 'drop';
  if (trimmed.startsWith('CREATE ')) return 'create';
  if (trimmed.startsWith('ALTER ')) return 'alter';
  return 'other';
}

function groupStatements(diffSql) {
  const statements = splitSqlStatements(stripCommentLines(diffSql));
  const tableMap = new Map();
  const generalStatements = [];
  let dropStatements = 0;

  for (const stmt of statements) {
    const name = extractTableName(stmt);
    const type = classifyStatement(stmt);
    if (type === 'drop') dropStatements += 1;
    if (name) {
      if (!tableMap.has(name)) {
        tableMap.set(name, { name, statements: [], hasDrops: false });
      }
      const entry = tableMap.get(name);
      entry.statements.push({ sql: stmt, type });
      if (type === 'drop') entry.hasDrops = true;
    } else {
      generalStatements.push({ sql: stmt, type });
    }
  }

  const tables = Array.from(tableMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
    tables,
    generalStatements,
    stats: {
      statementCount: statements.length,
      tableCount: tables.length,
      dropStatements,
    },
  };
}

function basicDiffFromDumps(currentSql, targetSql, allowDrops = false) {
  const createRegex = /CREATE\s+TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?\s*[\s\S]*?;/gi;
  const currentTables = new Map();
  const targetTables = new Map();

  let m;
  while ((m = createRegex.exec(currentSql))) {
    currentTables.set(m[1], m[0]);
  }
  while ((m = createRegex.exec(targetSql))) {
    targetTables.set(m[1], m[0]);
  }

  const statements = [];
  const warnings = [];

  for (const [name, stmt] of targetTables.entries()) {
    if (!currentTables.has(name)) {
      statements.push(stmt);
    } else if (
      stripCommentLines(stmt).replace(/\s+/g, ' ').trim() !==
      stripCommentLines(currentTables.get(name)).replace(/\s+/g, ' ').trim()
    ) {
      warnings.push(`Table ${name} definitions differ and require manual review.`);
    }
  }

  if (allowDrops) {
    for (const name of currentTables.keys()) {
      if (!targetTables.has(name)) {
        statements.push(`DROP TABLE IF EXISTS \`${name}\`;`);
      }
    }
  }

  return { statements, warnings };
}

async function importSchemaFile(schemaFilePath, tempDbName, signal) {
  const pass = process.env.DB_PASS || '';
  const env = { ...process.env };
  if (pass) env.MYSQL_PWD = pass;
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || '';
  const port = process.env.DB_PORT;
  const mysqlArgs = ['-h', host];
  if (port) mysqlArgs.push('-P', String(port));
  if (user) mysqlArgs.push('-u', user);

  const hasMysql = await commandExists('mysql');
  if (hasMysql) {
    try {
      await runCommand(
        'mysql',
        [...mysqlArgs, '-e', `DROP DATABASE IF EXISTS \`${tempDbName}\`; CREATE DATABASE \`${tempDbName}\`;`],
        { env, signal },
      );
      await runCommand(
        'mysql',
        [...mysqlArgs, tempDbName],
        { env, signal, stdinFilePath: schemaFilePath },
      );
      return { importedWithCli: true };
    } catch (err) {
      if (err.aborted) {
        err.status = err.status || 499;
      } else {
        err.status = err.status || 500;
      }
      const stderrMsg = err.stderr?.trim();
      if (stderrMsg) {
        err.message = `${err.message || 'mysql import failed'}: ${stderrMsg}`;
      }
      err.details = err.details || { code: err.code, stderr: err.stderr, stdout: err.stdout };
      throw err;
    }
  }

  // Fallback: apply statements via pooled connection
  const sqlText = await fsPromises.readFile(schemaFilePath, 'utf8');
  const statements = splitSqlStatements(sqlText);
  const conn = await pool.getConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${tempDbName}\``);
    await conn.query(`CREATE DATABASE \`${tempDbName}\``);
    await conn.query(`USE \`${tempDbName}\``);
    for (const stmt of statements) {
      if (signal?.aborted) {
        const abortErr = new Error('Schema import aborted');
        abortErr.name = 'AbortError';
        abortErr.aborted = true;
        throw abortErr;
      }
      if (stmt) await conn.query(stmt);
    }
    return { importedWithCli: false };
  } finally {
    conn.release();
  }
}

async function dropTempDatabase(name) {
  try {
    await pool.query(`DROP DATABASE IF EXISTS \`${name}\``);
  } catch {
    // ignore cleanup errors
  }
}

export async function buildSchemaDiff(options = {}) {
  const { schemaPath, schemaFile, allowDrops = false, signal } = options;
  const prereq = await getSchemaDiffPrerequisites();
  if (!prereq.mysqldumpAvailable) {
    const err = new Error('mysqldump is required to extract the current schema.');
    err.status = 500;
    err.details = { prerequisite: 'mysqldump', checks: prereq };
    throw err;
  }
  if (!prereq.env.DB_NAME) {
    const err = new Error('DB_NAME environment variable must be set for schema diff.');
    err.status = 500;
    err.details = { prerequisite: 'DB_NAME', checks: prereq };
    throw err;
  }
  const toolAvailable = prereq.mysqldbcompareAvailable;
  const warnings = [];
  const resolvedSchema = resolveSchemaFile({ schemaPath, schemaFile });
  const schemaExists = await fsPromises
    .stat(resolvedSchema)
    .then((st) => st.isFile())
    .catch(() => false);
  if (!schemaExists) {
    const err = new Error(`Schema file not found: ${resolvedSchema}`);
    err.status = 400;
    throw err;
  }

  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'schema-diff-'));
  const dumpPath = path.join(tempDir, 'current_schema.sql');

  const { sql: currentSql } = await dumpCurrentSchema(dumpPath, signal);
  const targetSql = await fsPromises.readFile(resolvedSchema, 'utf8');

  let diffSql = '';
  let tool = 'mysqldbcompare';
  let tempDbName = '';
  let importedWithCli = false;

  if (toolAvailable) {
    tempDbName = `schema_diff_${crypto.randomBytes(5).toString('hex')}`;
    try {
      const { importedWithCli: viaCli } = await importSchemaFile(
        resolvedSchema,
        tempDbName,
        signal,
      );
      importedWithCli = viaCli;
      const host = process.env.DB_HOST || 'localhost';
      const user = process.env.DB_USER || '';
      const pass = process.env.DB_PASS || '';
      const port = process.env.DB_PORT;
      const dbName = process.env.DB_NAME;
      const env = { ...process.env };
      if (pass) env.MYSQL_PWD = pass;
      const serverConn = port ? `${user}@${host}:${port}` : `${user}@${host}`;
      const args = [
        `--server1=${serverConn}`,
        `--server2=${serverConn}`,
        `${tempDbName}:${dbName}`,
        '--difftype=sql',
        '--run-all-tests',
        '--changes-for=server2',
      ];
      const { stdout, stderr } = await runCommand('mysqldbcompare', args, {
        env,
        signal,
      });
      diffSql = stripCommentLines([stdout, stderr].filter(Boolean).join('\n'));
    } finally {
      if (tempDbName) {
        await dropTempDatabase(tempDbName);
      }
    }
  } else {
    tool = 'basic';
    warnings.push(
      'mysqldbcompare is not available on this server; using a basic CREATE TABLE diff instead.',
    );
    const fallback = basicDiffFromDumps(currentSql, targetSql, allowDrops);
    diffSql = fallback.statements.join('\n\n');
    warnings.push(...fallback.warnings);
  }

  const diffPath = path.join(tempDir, 'schema_diff.sql');
  await fsPromises.writeFile(diffPath, diffSql || '-- Schemas already match', 'utf8');
  const grouped = groupStatements(diffSql);

  return {
    tool,
    toolAvailable,
    prerequisites: prereq,
    importedWithCli,
    allowDrops,
    warnings,
    diffPath,
    currentSchemaPath: dumpPath,
    targetSchemaPath: resolvedSchema,
    generatedAt: new Date().toISOString(),
    diffText: diffSql,
    ...grouped,
  };
}

export async function applySchemaDiffStatements(statements, options = {}) {
  const { allowDrops = false, dryRun = false, signal } = options;
  if (!Array.isArray(statements) || statements.length === 0) {
    const err = new Error('At least one statement is required');
    err.status = 400;
    throw err;
  }
  const cleaned = statements.map((s) => s.trim()).filter(Boolean);
  const dropStatements = cleaned.filter((s) => /^DROP\s+/i.test(s));
  if (dropStatements.length && !allowDrops) {
    const err = new Error(
      'Drop statements detected. Enable "include drops" to apply them.',
    );
    err.status = 400;
    err.details = { dropStatements };
    throw err;
  }

  if (dryRun) {
    return {
      applied: 0,
      failed: [],
      dropStatements: dropStatements.length,
      dryRun: true,
      statements: cleaned,
      durationMs: 0,
    };
  }

  const conn = await pool.getConnection();
  let applied = 0;
  const failed = [];
  const started = Date.now();
  try {
    await conn.beginTransaction();
    for (const stmt of cleaned) {
      if (signal?.aborted) {
        const abortErr = new Error('Schema diff application aborted');
        abortErr.name = 'AbortError';
        abortErr.aborted = true;
        throw abortErr;
      }
      try {
        await conn.query(stmt);
        applied += 1;
      } catch (err) {
        failed.push({ statement: stmt, error: err.message });
        const wrapped = new Error('Failed to apply schema diff statement');
        wrapped.status = 400;
        wrapped.details = { applied, failed };
        throw wrapped;
      }
    }
    await conn.commit();
    return {
      applied,
      failed,
      dropStatements: dropStatements.length,
      dryRun: false,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors
    }
    if (err.status) throw err;
    err.status = err.aborted ? 499 : 500;
    err.details = err.details || { applied, failed };
    throw err;
  } finally {
    conn.release();
  }
}

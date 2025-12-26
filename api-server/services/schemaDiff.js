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
  const warnings = [];
  if (!mysqldumpAvailable) missing.push('mysqldump');
  if (!mysqldbcompareAvailable) {
    warnings.push(
      'mysqldbcompare is not available; schema diffs will fall back to basic comparisons without ALTER statements.',
    );
  }
  if (!env.DB_NAME) missing.push('DB_NAME');

  return {
    mysqldumpAvailable,
    mysqldbcompareAvailable,
    mysqlAvailable,
    env,
    missing,
    warnings,
  };
}

function buildAbortError(message = 'Database schema dump aborted due to request cancellation.') {
  const abortErr = new Error(message);
  abortErr.name = 'AbortError';
  abortErr.aborted = true;
  abortErr.status = 499;
  return abortErr;
}

function ensureNotAborted(signal, message) {
  if (signal?.aborted) {
    throw buildAbortError(message);
  }
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
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ['pipe', captureStdout ? 'pipe' : 'ignore', captureStderr ? 'pipe' : 'ignore'],
      });
    } catch (err) {
      const enoent = err.code === 'ENOENT' ? `Command ${command} not found in PATH` : err.message;
      const wrapped = new Error(enoent || 'Failed to start command');
      wrapped.code = err.code;
      return reject(wrapped);
    }

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      if (child) child.kill('SIGTERM');
      const abortErr = buildAbortError(`${command} aborted`);
      cleanup();
      reject(abortErr);
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    if (captureStdout && child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (captureStderr && child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    if (stdinFilePath && child.stdin) {
      const stream = fs.createReadStream(stdinFilePath);
      stream.on('error', (err) => {
        if (child) child.kill('SIGTERM');
        cleanup();
        reject(err);
      });
      stream.pipe(child.stdin);
    } else if (child.stdin) {
      child.stdin.end();
    }

    child.on('error', (err) => {
      cleanup();
      const enoent = err.code === 'ENOENT' ? `Command ${command} not found in PATH` : err.message;
      const wrapped = new Error(enoent || err.message || 'Command failed to start');
      wrapped.code = err.code;
      reject(wrapped);
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

async function dumpCurrentSchema(outputPath, signal, onProgress) {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || '';
  const pass = process.env.DB_PASS || '';
  const dbName = process.env.DB_NAME;
  const port = process.env.DB_PORT;
  ensureNotAborted(signal);
  if (onProgress) onProgress('Dumping current database schema');
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
    return { outputPath, sql: stdout, source: 'mysqldump' };
  } catch (err) {
    if (err.aborted) {
      err.status = err.status || 499;
      err.message = err.message || 'Database schema dump aborted due to request cancellation.';
    } else {
      err.status = err.status || 500;
      const stderrMsg = err.stderr?.trim();
      if (err.code === 'ENOENT' || /not found/i.test(stderrMsg || '')) {
        err.message = 'mysqldump is required and was not found in PATH.';
      } else {
        err.message = stderrMsg
          ? `mysqldump failed: ${stderrMsg}`
          : err.message || 'mysqldump failed';
      }
    }
    err.details = err.details || { code: err.code, stderr: err.stderr, stdout: err.stdout };
    throw err;
  }
}

async function dumpSchemaViaNode(outputPath, signal, onProgress) {
  const dbName = process.env.DB_NAME;
  if (!dbName) {
    const err = new Error('DB_NAME environment variable must be set for schema diff.');
    err.status = 500;
    throw err;
  }
  ensureNotAborted(signal);
  if (onProgress) onProgress('Dumping schema via database connection');
  const conn = await pool.getConnection();
  try {
    const statements = [];
    const [tables] = await conn.query(`SHOW FULL TABLES FROM \`${dbName}\``);
    const tableKey = tables.length
      ? Object.keys(tables[0]).find((k) => k.toLowerCase().startsWith('tables_in_'))
      : null;
    if (tableKey) {
      for (const row of tables) {
        ensureNotAborted(signal);
        const name = row[tableKey];
        const typeKey = Object.keys(row).find((k) => k.toLowerCase().includes('table_type'));
        const isView = (row[typeKey] || '').toUpperCase() === 'VIEW';
        const [createRows] = await conn.query(
          isView
            ? `SHOW CREATE VIEW \`${dbName}\`.\`${name}\``
            : `SHOW CREATE TABLE \`${dbName}\`.\`${name}\``,
        );
        const createKey =
          Object.keys(createRows[0] || {}).find((k) => k.toLowerCase().startsWith('create ')) ||
          'Create Table';
        const createSql = createRows[0]?.[createKey];
        if (createSql) {
          statements.push(`${createSql};`);
        }
      }
    }

    // Triggers
    const [triggers] = await conn.query(`SHOW TRIGGERS FROM \`${dbName}\``);
    for (const trigger of triggers) {
      ensureNotAborted(signal);
      const [createTrig] = await conn.query(`SHOW CREATE TRIGGER \`${dbName}\`.\`${trigger.Trigger}\``);
      const sql = createTrig[0]?.['SQL Original Statement'];
      if (sql) statements.push(`${sql};`);
    }

    // Events
    const [events] = await conn.query(`SHOW EVENTS FROM \`${dbName}\``);
    for (const evt of events) {
      ensureNotAborted(signal);
      const [createEvt] = await conn.query(`SHOW CREATE EVENT \`${dbName}\`.\`${evt.Name}\``);
      const sql = createEvt[0]?.['Create Event'];
      if (sql) statements.push(`${sql};`);
    }

    // Routines
    const [procedures] = await conn.query(
      'SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?',
      [dbName],
    );
    for (const routine of procedures) {
      ensureNotAborted(signal);
      const routineType = (routine.ROUTINE_TYPE || '').toUpperCase();
      const objectName = `\`${dbName}\`.\`${routine.ROUTINE_NAME}\``;
      const createQuery =
        routineType === 'FUNCTION'
          ? `SHOW CREATE FUNCTION ${objectName}`
          : `SHOW CREATE PROCEDURE ${objectName}`;
      const [rows] = await conn.query(createQuery);
      const key = routineType === 'FUNCTION' ? 'Create Function' : 'Create Procedure';
      const sql = rows[0]?.[key];
      if (sql) statements.push(`${sql};`);
    }

    const sqlText = statements.join('\n\n');
    await fsPromises.writeFile(outputPath, sqlText, 'utf8');
    return { outputPath, sql: sqlText, source: 'node' };
  } finally {
    conn.release();
  }
}

async function dumpCurrentSchemaWithFallback(outputPath, signal, onProgress) {
  try {
    return await dumpCurrentSchema(outputPath, signal, onProgress);
  } catch (err) {
    if (err.aborted) throw err;
    if (onProgress) onProgress('mysqldump unavailable or failed; falling back to node dump.');
    const fallback = await dumpSchemaViaNode(outputPath, signal, onProgress);
    fallback.warnings = [
      'mysqldump failed or was unavailable; schema dump generated via database connection instead.',
      err.message,
    ].filter(Boolean);
    return fallback;
  }
}

function stripCommentLines(sqlText) {
  return sqlText
    .split(/\r?\n/)
    .filter((line) => !/^\s*(#|--)/.test(line) && !/^\s*DELIMITER\b/i.test(line))
    .join('\n')
    .trim();
}

const OBJECT_PATTERNS = [
  { type: 'table', regex: /\bTABLE\s+`?([A-Za-z0-9_]+)`?/i },
  {
    type: 'view',
    regex:
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:ALGORITHM=\w+\s+)?(?:DEFINER=`?[^`]+`?@`?[^`]+`?\s+)?(?:SQL\s+SECURITY\s+\w+\s+)?VIEW\s+`?([A-Za-z0-9_]+)`?/i,
  },
  { type: 'trigger', regex: /\bTRIGGER\s+`?([A-Za-z0-9_]+)`?/i },
  { type: 'procedure', regex: /\bPROCEDURE\s+`?([A-Za-z0-9_]+)`?/i },
  { type: 'function', regex: /\bFUNCTION\s+`?([A-Za-z0-9_]+)`?/i },
  { type: 'event', regex: /\bEVENT\s+`?([A-Za-z0-9_]+)`?/i },
];

function extractObject(statement) {
  for (const pattern of OBJECT_PATTERNS) {
    const match = statement.match(pattern.regex);
    if (match) {
      return { name: match[1], type: pattern.type };
    }
  }
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
  const objectMap = new Map();
  const generalStatements = [];
  let dropStatements = 0;

  for (const stmt of statements) {
    const objectInfo = extractObject(stmt);
    const type = classifyStatement(stmt);
    if (type === 'drop') dropStatements += 1;
    if (objectInfo?.name) {
      const key = `${objectInfo.type}:${objectInfo.name}`;
      if (!objectMap.has(key)) {
        objectMap.set(key, { key, name: objectInfo.name, type: objectInfo.type, statements: [], hasDrops: false });
      }
      const entry = objectMap.get(key);
      entry.statements.push({ sql: stmt, type });
      if (type === 'drop') entry.hasDrops = true;
    } else {
      generalStatements.push({ sql: stmt, type });
    }
  }

  const tables = Array.from(objectMap.values()).sort((a, b) => {
    const typeCompare = (a.type || '').localeCompare(b.type || '');
    if (typeCompare !== 0) return typeCompare;
    return a.name.localeCompare(b.name);
  });

  return {
    tables,
    generalStatements,
    stats: {
      statementCount: statements.length,
      objectCount: tables.length,
      tableCount: tables.length,
      dropStatements,
    },
  };
}

function buildDropStatement(type, name) {
  const lowered = (type || '').toLowerCase();
  switch (lowered) {
    case 'table':
      return `DROP TABLE IF EXISTS \`${name}\`;`;
    case 'view':
      return `DROP VIEW IF EXISTS \`${name}\`;`;
    case 'trigger':
      return `DROP TRIGGER IF EXISTS \`${name}\`;`;
    case 'procedure':
      return `DROP PROCEDURE IF EXISTS \`${name}\`;`;
    case 'function':
      return `DROP FUNCTION IF EXISTS \`${name}\`;`;
    case 'event':
      return `DROP EVENT IF EXISTS \`${name}\`;`;
    default:
      return '';
  }
}

function normalizeDefinition(stmt) {
  return stripCommentLines(stmt).replace(/\s+/g, ' ').trim();
}

function parseDefinitions(sqlText) {
  const statements = splitSqlStatements(stripCommentLines(sqlText));
  const map = new Map();
  for (const stmt of statements) {
    if (!/^CREATE\s+/i.test(stmt)) continue;
    const info = extractObject(stmt);
    if (!info?.name) continue;
    const key = `${info.type}:${info.name}`;
    map.set(key, { ...info, statement: stmt });
  }
  return map;
}

function basicDiffFromDumps(currentSql, targetSql, allowDrops = false) {
  const currentObjects = parseDefinitions(currentSql);
  const targetObjects = parseDefinitions(targetSql);

  const statements = [];
  const warnings = [];

  for (const [key, targetObj] of targetObjects.entries()) {
    const currentObj = currentObjects.get(key);
    if (!currentObj) {
      statements.push(targetObj.statement);
      continue;
    }
    if (normalizeDefinition(targetObj.statement) !== normalizeDefinition(currentObj.statement)) {
      if (targetObj.type === 'table') {
        warnings.push(
          `Table ${targetObj.name} definitions differ and require manual review. Install mysqldbcompare for full ALTER scripting.`,
        );
      } else {
        const dropStmt = buildDropStatement(targetObj.type, targetObj.name);
        if (dropStmt) statements.push(dropStmt);
        statements.push(targetObj.statement);
        warnings.push(
          `${targetObj.type} ${targetObj.name} definitions differ; generated DROP/CREATE statements to refresh the object.`,
        );
      }
    }
  }

  if (allowDrops) {
    for (const [key, currentObj] of currentObjects.entries()) {
      if (!targetObjects.has(key)) {
        const dropStmt = buildDropStatement(currentObj.type, currentObj.name);
        if (dropStmt) statements.push(dropStmt);
      }
    }
  }

  return { statements, warnings };
}

async function importSchemaFile(schemaFilePath, tempDbName, signal, onProgress) {
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
      if (onProgress) onProgress('Preparing temporary database for diff');
      await runCommand(
        'mysql',
        [...mysqlArgs, '-e', `DROP DATABASE IF EXISTS \`${tempDbName}\`; CREATE DATABASE \`${tempDbName}\`;`],
        { env, signal },
      );
      ensureNotAborted(signal, 'Schema import aborted');
      if (onProgress) onProgress('Importing target schema into temporary database');
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
    if (onProgress) onProgress('Importing schema via pooled connection');
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
  const { schemaPath, schemaFile, allowDrops = false, signal, onProgress } = options;
  const prereq = await getSchemaDiffPrerequisites();
  if (!prereq.env.DB_NAME) {
    const err = new Error('DB_NAME environment variable must be set for schema diff.');
    err.status = 500;
    err.details = { prerequisite: 'DB_NAME', checks: prereq };
    throw err;
  }
  const toolAvailable = prereq.mysqldbcompareAvailable;
  const warnings = [...(prereq.warnings || [])];
  const resolvedSchema = resolveSchemaFile({ schemaPath, schemaFile });
  if (onProgress) onProgress('Validating schema file path');
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

  const dumpResult = await dumpCurrentSchemaWithFallback(dumpPath, signal, onProgress);
  const { sql: currentSql } = dumpResult;
  const targetSql = await fsPromises.readFile(resolvedSchema, 'utf8');

  let diffSql = '';
  let tool = 'mysqldbcompare';
  let tempDbName = '';
  let importedWithCli = false;
  const processWarnings = [...(dumpResult.warnings || [])];

  if (toolAvailable) {
    tempDbName = `schema_diff_${crypto.randomBytes(5).toString('hex')}`;
    try {
      const { importedWithCli: viaCli } = await importSchemaFile(
        resolvedSchema,
        tempDbName,
        signal,
        onProgress,
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
      if (onProgress) onProgress('Comparing schemas with mysqldbcompare');
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
    if (onProgress) onProgress('mysqldbcompare not available; using basic diff.');
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
    warnings: [...warnings, ...processWarnings],
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

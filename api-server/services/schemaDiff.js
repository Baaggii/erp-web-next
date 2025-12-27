import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { pool } from '../../db/index.js';
import { splitSqlStatements } from './generatedSql.js';
import { assertAdminUser } from '../utils/admin.js';

const projectRoot = process.cwd();
const BASELINE_RECORD_PATH = path.join(projectRoot, 'db', 'schema-baseline.json');

function ensureAdmin(options = {}) {
  // Admin-only: schema diff routines can dump/apply DDL using elevated DB credentials.
  assertAdminUser(options.user);
}

async function commandExists(cmd) {
  try {
    await runCommand('which', [cmd], { captureStdout: false, captureStderr: false });
    return true;
  } catch {
    return false;
  }
}

export async function getSchemaDiffPrerequisites(options = {}) {
  ensureAdmin(options);
  const [mysqldumpAvailable, liquibaseAvailable, mysqlAvailable] = await Promise.all([
    commandExists('mysqldump'),
    commandExists('liquibase'),
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
  if (!liquibaseAvailable) {
    warnings.push(
      'Liquibase is not available; schema diffs will fall back to bootstrap (CREATE) scripts without ALTER coverage.',
    );
  }
  if (!env.DB_NAME) missing.push('DB_NAME');

  return {
    mysqldumpAvailable,
    liquibaseAvailable,
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

function classifyRisk(changeType, objectType) {
  if (changeType === 'drop') return 'high';
  if (changeType === 'alter' || changeType === 'update') return 'medium';
  if (objectType === 'procedure' || objectType === 'trigger') return 'medium';
  return 'low';
}

function groupStatements(diffSql, metadata = []) {
  const statements = splitSqlStatements(stripCommentLines(diffSql));
  const objectMap = new Map();
  const generalStatements = [];
  let dropStatements = 0;

  const metadataLookup = new Map();
  metadata.forEach((m) => {
    if (m?.type && m?.name) {
      metadataLookup.set(`${m.type}:${m.name}`, m);
    }
  });

  for (const stmt of statements) {
    const objectInfo = extractObject(stmt);
    const type = classifyStatement(stmt);
    const risk = classifyRisk(type, objectInfo?.type);
    if (type === 'drop') dropStatements += 1;
    if (objectInfo?.name) {
      const key = `${objectInfo.type}:${objectInfo.name}`;
      if (!objectMap.has(key)) {
        const meta = metadataLookup.get(key);
        objectMap.set(key, {
          key,
          name: objectInfo.name,
          type: objectInfo.type,
          statements: [],
          hasDrops: false,
          details: meta?.message,
          state: meta?.state,
        });
      }
      const entry = objectMap.get(key);
      entry.statements.push({ sql: stmt, type, risk });
      if (type === 'drop') entry.hasDrops = true;
    } else {
      generalStatements.push({ sql: stmt, type, risk });
    }
  }

  const typeOrder = ['table', 'view', 'procedure', 'function', 'trigger', 'index', 'other'];
  const groupedObjects = Array.from(objectMap.values()).sort((a, b) => {
    const at = typeOrder.indexOf(a.type);
    const bt = typeOrder.indexOf(b.type);
    if (at !== bt) return at - bt;
    return a.name.localeCompare(b.name);
  });

  const groups = {
    table: [],
    view: [],
    procedure: [],
    function: [],
    trigger: [],
    index: [],
    other: [],
  };
  groupedObjects.forEach((obj) => {
    const bucket = groups[obj.type] || groups.other;
    bucket.push(obj);
  });

  const riskCounts = { low: 0, medium: 0, high: 0 };
  statements.forEach((stmt) => {
    const riskLevel = classifyRisk(classifyStatement(stmt), extractObject(stmt)?.type);
    riskCounts[riskLevel] += 1;
  });

  return {
    groups,
    generalStatements,
    stats: {
      statementCount: statements.length,
      objectCount: groupedObjects.length,
      tableCount: groups.table.length,
      viewCount: groups.view.length,
      routineCount: groups.procedure.length + groups.function.length + groups.trigger.length,
      dropStatements,
      riskCounts,
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
          `Table ${targetObj.name} definitions differ and require manual review. Install Liquibase for full ALTER scripting.`,
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

async function loadBaselines() {
  try {
    const payload = await fsPromises.readFile(BASELINE_RECORD_PATH, 'utf8');
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore missing/invalid baseline file
  }
  return { baselines: {} };
}

async function saveBaselines(data) {
  const dir = path.dirname(BASELINE_RECORD_PATH);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(BASELINE_RECORD_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function computeSchemaHash(sqlText) {
  return crypto.createHash('sha256').update(sqlText || '', 'utf8').digest('hex');
}

async function getBaselineStatus(resolvedSchemaPath, targetSql) {
  const store = await loadBaselines();
  const key = path.relative(projectRoot, resolvedSchemaPath);
  const entry = store.baselines?.[key];
  const hash = computeSchemaHash(targetSql);
  if (!entry) {
    return {
      path: key,
      inSync: false,
      recordedAt: null,
      hash,
    };
  }
  return {
    ...entry,
    path: key,
    hash,
    inSync: entry.hash === hash,
  };
}

async function markBaseline(resolvedSchemaPath, targetSql) {
  const store = await loadBaselines();
  const key = path.relative(projectRoot, resolvedSchemaPath);
  const now = new Date().toISOString();
  const hash = computeSchemaHash(targetSql);
  const next = {
    baselines: {
      ...(store.baselines || {}),
      [key]: {
        hash,
        recordedAt: now,
        schemaFile: key,
      },
    },
  };
  await saveBaselines(next);
  return next.baselines[key];
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

function summarizeLiquibaseDifference(diffJson) {
  const items = [];
  const diffResult = diffJson?.differences || diffJson?.diffResult || [];
  const diffArray = Array.isArray(diffResult) ? diffResult : [];
  for (const entry of diffArray) {
    if (!entry) continue;
    const name = entry.objectName || entry.name || entry.referenceObject?.name || entry.targetObject?.name;
    const type = (entry.objectType || entry.type || entry?.comparisonControl?.type || '').toString().toLowerCase();
    const message = entry.message || entry.differences || entry.reason;
    if (name || type || message) {
      items.push({
        name: name || 'unnamed',
        type: type || 'object',
        message: typeof message === 'string' ? message : undefined,
        state: entry.state || entry.status || entry.operation,
      });
    }
  }
  return items;
}

function mapLiquibaseObjects(diffItems) {
  const metadata = [];
  for (const item of diffItems) {
    const normalizedType = (item.type || '').toLowerCase();
    let objectType = normalizedType;
    if (/table/.test(normalizedType)) objectType = 'table';
    else if (/view/.test(normalizedType)) objectType = 'view';
    else if (/trigger/.test(normalizedType)) objectType = 'trigger';
    else if (/procedure/.test(normalizedType)) objectType = 'procedure';
    else if (/function/.test(normalizedType)) objectType = 'function';
    else if (/index/.test(normalizedType)) objectType = 'index';
    else if (/sequence/.test(normalizedType)) objectType = 'sequence';
    if (objectType) {
      metadata.push({
        name: item.name,
        type: objectType,
        state: item.state || item.status || 'changed',
        message: item.message,
      });
    }
  }
  return metadata;
}

function buildActionableWarnings(grouped) {
  const warnings = [];
  const typeLabel = {
    table: 'Table',
    view: 'View',
    trigger: 'Trigger',
    procedure: 'Procedure',
    function: 'Function',
    index: 'Index',
    other: 'Object',
  };
  Object.values(grouped.groups || {}).forEach((objs = []) => {
    objs.forEach((obj) => {
      const hasAlter = obj.statements.some((s) => s.type === 'alter');
      const hasDrop = obj.statements.some((s) => s.type === 'drop');
      const label = typeLabel[obj.type] || 'Object';
      if (hasDrop) {
        warnings.push(`❌ ${label} ${obj.name} will be dropped and recreated.`);
      } else if (hasAlter) {
        warnings.push(`❌ ${label} ${obj.name} includes ALTER changes; review carefully.`);
      } else if (obj.details) {
        warnings.push(`⚠️ ${label} ${obj.name}: ${obj.details}`);
      }
    });
  });
  return warnings;
}

function buildApplyPlan(statements) {
  const order = ['general', 'table', 'index', 'view', 'procedure', 'function', 'trigger', 'other'];
  const sorted = [...statements].sort((a, b) => {
    const aOrder = order.indexOf(a.objectType || 'other');
    const bOrder = order.indexOf(b.objectType || 'other');
    if (aOrder !== bOrder) return aOrder - bOrder;
    const riskWeight = { low: 0, medium: 1, high: 2 };
    const aRisk = riskWeight[a.risk || 'low'];
    const bRisk = riskWeight[b.risk || 'low'];
    if (aRisk !== bRisk) return aRisk - bRisk;
    return 0;
  });
  return sorted;
}

async function dropTempDatabase(name) {
  try {
    await pool.query(`DROP DATABASE IF EXISTS \`${name}\``);
  } catch {
    // ignore cleanup errors
  }
}

export async function buildSchemaDiff(options = {}) {
  ensureAdmin(options);
  const { schemaPath, schemaFile, allowDrops = false, signal, onProgress } = options;
  const prereq = await getSchemaDiffPrerequisites(options);
  if (!prereq.env.DB_NAME) {
    const err = new Error('DB_NAME environment variable must be set for schema diff.');
    err.status = 500;
    err.details = { prerequisite: 'DB_NAME', checks: prereq };
    throw err;
  }
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
  const baselineStatus = await getBaselineStatus(resolvedSchema, targetSql);

  let diffSql = '';
  let tool = 'liquibase';
  let tempDbName = '';
  let importedWithCli = false;
  const processWarnings = [...(dumpResult.warnings || [])];
  let grouped = { groups: {}, generalStatements: [], stats: {} };
  let diffItems = [];

  if (prereq.liquibaseAvailable) {
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
      const jdbcHost = port ? `${host}:${port}` : host;
      const changelogPath = path.join(tempDir, 'liquibase-diff.changelog.xml');
      const baseArgs = [
        `--url=jdbc:mysql://${jdbcHost}/${dbName}`,
        `--username=${user}`,
        `--password=${pass}`,
        `--referenceUrl=jdbc:mysql://${jdbcHost}/${tempDbName}`,
        `--referenceUsername=${user}`,
        `--referencePassword=${pass}`,
        `--changeLogFile=${changelogPath}`,
        '--log-level=warning',
      ];
      if (onProgress) onProgress('Generating Liquibase diff changelog');
      await runCommand('liquibase', [...baseArgs, 'diffChangelog'], {
        env,
        signal,
      });
      if (onProgress) onProgress('Preparing Liquibase SQL preview');
      const { stdout } = await runCommand(
        'liquibase',
        [...baseArgs, 'updateSql'],
        { env, signal },
      );
      diffSql = stripCommentLines(stdout);

      let liquibaseJson = null;
      try {
        const { stdout: jsonOut } = await runCommand(
          'liquibase',
          [...baseArgs, '--format=json', 'diff'],
          { env, signal },
        );
        const jsonStart = jsonOut.indexOf('{');
        const payload = jsonStart >= 0 ? jsonOut.slice(jsonStart) : jsonOut;
        liquibaseJson = JSON.parse(payload);
      } catch (err) {
        processWarnings.push(
          err?.message
            ? `Liquibase JSON diff parsing failed: ${err.message}`
            : 'Liquibase JSON diff unavailable; using SQL-only output.',
        );
      }
      diffItems = liquibaseJson ? summarizeLiquibaseDifference(liquibaseJson) : [];
      grouped = groupStatements(diffSql, mapLiquibaseObjects(diffItems));
      const actionableWarnings = buildActionableWarnings(grouped);
      warnings.push(...actionableWarnings);
    } catch (err) {
      if (err?.aborted) throw err;
      warnings.push(`Liquibase diff failed; falling back to bootstrap diff. Reason: ${err.message}`);
      tool = 'basic';
      const fallback = basicDiffFromDumps(currentSql, targetSql, allowDrops);
      diffSql = fallback.statements.join('\n\n');
      warnings.push(...fallback.warnings);
      grouped = groupStatements(diffSql);
    } finally {
      if (tempDbName) {
        await dropTempDatabase(tempDbName);
      }
    }
  } else {
    if (onProgress) onProgress('Liquibase not available; using basic diff.');
    tool = 'basic';
    warnings.push(
      'Liquibase is not available on this server; using a bootstrap CREATE diff only. ALTER, DROP, and routine changes will not be scripted.',
    );
    const fallback = basicDiffFromDumps(currentSql, targetSql, allowDrops);
    diffSql = fallback.statements.join('\n\n');
    warnings.push(...fallback.warnings);
    grouped = groupStatements(diffSql);
  }

  const diffPath = path.join(tempDir, 'schema_diff.sql');
  await fsPromises.writeFile(diffPath, diffSql || '-- Schemas already match', 'utf8');

  const inSyncWithBaseline =
    baselineStatus.inSync && (grouped.stats?.statementCount || 0) === 0;
  return {
    tool,
    toolAvailable: prereq.liquibaseAvailable,
    prerequisites: prereq,
    importedWithCli,
    allowDrops,
    warnings: [...warnings, ...processWarnings],
    diffPath,
    currentSchemaPath: dumpPath,
    targetSchemaPath: resolvedSchema,
    generatedAt: new Date().toISOString(),
    diffText: diffSql,
    groups: grouped.groups,
    generalStatements: grouped.generalStatements,
    stats: grouped.stats,
    baseline: {
      ...baselineStatus,
      inSync: inSyncWithBaseline,
      outOfSyncObjects: grouped.stats?.objectCount || 0,
    },
    diffItems,
  };
}

export async function recordSchemaBaseline(options = {}) {
  ensureAdmin(options);
  const { schemaPath, schemaFile } = options;
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
  const targetSql = await fsPromises.readFile(resolvedSchema, 'utf8');
  const baseline = await markBaseline(resolvedSchema, targetSql);
  return {
    path: path.relative(projectRoot, resolvedSchema),
    recordedAt: baseline.recordedAt,
    hash: baseline.hash,
  };
}

export async function applySchemaDiffStatements(statements, options = {}) {
  ensureAdmin(options);
  const {
    allowDrops = false,
    dryRun = false,
    signal,
    alterPreviewed = false,
    routineAcknowledged = false,
  } = options;
  if (!Array.isArray(statements) || statements.length === 0) {
    const err = new Error('At least one statement is required');
    err.status = 400;
    throw err;
  }
  const normalized = statements
    .map((s) => (typeof s === 'string' ? { sql: s } : s))
    .map((s) => ({
      ...s,
      sql: (s.sql || '').trim(),
      type: s.type || classifyStatement(s.sql || ''),
      objectType: s.objectType || extractObject(s.sql || '')?.type || 'other',
      risk: s.risk || classifyRisk(s.type || classifyStatement(s.sql || ''), s.objectType),
    }))
    .filter((s) => Boolean(s.sql));
  if (!normalized.length) {
    const err = new Error('At least one statement is required');
    err.status = 400;
    throw err;
  }
  const dropStatements = normalized.filter((s) => /^DROP\s+/i.test(s.sql));
  const hasAlters = normalized.some((s) => s.type === 'alter');
  const routineStatements = normalized.filter(
    (s) => s.objectType === 'procedure' || s.objectType === 'trigger',
  );
  if (dropStatements.length && !allowDrops) {
    const err = new Error(
      'Drop statements detected. Enable "include drops" to apply them.',
    );
    err.status = 400;
    err.details = { dropStatements: dropStatements.map((s) => s.sql) };
    throw err;
  }
  if (!dryRun && hasAlters && !alterPreviewed) {
    const err = new Error('ALTER statements require preview confirmation before apply.');
    err.status = 400;
    err.details = { alters: normalized.filter((s) => s.type === 'alter').map((s) => s.sql) };
    throw err;
  }
  if (!dryRun && routineStatements.length && !routineAcknowledged) {
    const err = new Error('Routine changes require explicit acknowledgement.');
    err.status = 400;
    err.details = { routines: routineStatements.map((s) => s.sql) };
    throw err;
  }

  const ordered = buildApplyPlan(normalized);

  if (dryRun) {
    return {
      applied: 0,
      failed: [],
      dropStatements: dropStatements.length,
      dryRun: true,
      statements: ordered.map((s) => s.sql),
      durationMs: 0,
    };
  }

  const conn = await pool.getConnection();
  let applied = 0;
  const failed = [];
  const started = Date.now();
  try {
    await conn.beginTransaction();
    for (const stmt of ordered) {
      if (signal?.aborted) {
        const abortErr = new Error('Schema diff application aborted');
        abortErr.name = 'AbortError';
        abortErr.aborted = true;
        throw abortErr;
      }
      try {
        await conn.query(stmt.sql);
        applied += 1;
      } catch (err) {
        failed.push({ statement: stmt.sql, error: err.message });
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
      alterPreviewed,
      routineAcknowledged,
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

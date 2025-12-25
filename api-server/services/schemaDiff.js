import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { pool } from '../../db/index.js';
import { splitSqlStatements } from './generatedSql.js';

const REFERENCE_SCHEMA_PATH = path.resolve(
  process.cwd(),
  'db',
  'mgtmn_erp_db.sql',
);
const CURRENT_SCHEMA_PATH = path.resolve(
  process.cwd(),
  'db',
  'current_schema.sql',
);

function mysqlEnv(password) {
  return {
    ...process.env,
    MYSQL_PWD: password ?? process.env.DB_PASS ?? '',
  };
}

function mysqlBaseArgs() {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '3306';
  const user = process.env.DB_USER || '';
  const args = ['--protocol=tcp'];
  if (host) args.push(`--host=${host}`);
  if (port) args.push(`--port=${port}`);
  if (user) args.push(`--user=${user}`);
  return args;
}

async function runCommand(command, args, options = {}) {
  const { env, stdinFile, outputFile } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env });
    let stdout = '';
    let stderr = '';

    if (stdinFile) {
      const input = fs.createReadStream(stdinFile);
      input.on('error', reject);
      input.pipe(child.stdin);
    }

    let outputStream;
    if (outputFile) {
      outputStream = fs.createWriteStream(outputFile);
      outputStream.on('error', reject);
      child.stdout.pipe(outputStream);
    } else {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (outputStream) outputStream.end();
      resolve({ code, stdout, stderr });
    });
  });
}

async function checkToolAvailability(command) {
  try {
    const result = await runCommand(command, ['--version']);
    return result.code === 0;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    return false;
  }
}

function normalizeSql(sql) {
  if (!sql) return '';
  return sql.replace(/[`\s]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractTableStatements(sqlText) {
  const map = new Map();
  if (!sqlText) return map;
  const TABLE_RE = /CREATE\s+TABLE\s+`?([A-Za-z0-9_]+)`?\s*\([\s\S]*?\);/gi;
  let match;
  while ((match = TABLE_RE.exec(sqlText)) !== null) {
    const table = match[1];
    const createStmt = match[0];
    const dropRe = new RegExp(`DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+\\\`?${table}\\\`?;`, 'i');
    const before = sqlText.slice(Math.max(0, match.index - 200), match.index);
    const hasDrop = dropRe.test(before);
    const block = hasDrop ? `${before.match(dropRe) || ''}\n${createStmt}` : createStmt;
    map.set(table, block.trim());
  }
  return map;
}

function buildDiffPreview(currentSql, referenceSql) {
  const currentLines = (currentSql || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const referenceLines = (referenceSql || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const max = 8;
  const previews = [];
  const len = Math.max(currentLines.length, referenceLines.length);
  for (let i = 0; i < len && previews.length < max; i++) {
    if (currentLines[i] !== referenceLines[i]) {
      if (referenceLines[i]) previews.push(`+ ${referenceLines[i]}`);
      if (currentLines[i]) previews.push(`- ${currentLines[i]}`);
    }
  }
  return previews.join('\n');
}

async function dumpCurrentSchema() {
  const hasMysqldump = await checkToolAvailability('mysqldump');
  if (!hasMysqldump) {
    throw new Error('mysqldump is not available on this server');
  }
  await fsPromises.mkdir(path.dirname(CURRENT_SCHEMA_PATH), { recursive: true });
  const args = [
    ...mysqlBaseArgs(),
    '--no-data',
    '--skip-comments',
    '--routines',
    '--events',
    '--triggers',
    process.env.DB_NAME,
  ];
  const result = await runCommand('mysqldump', args, {
    env: mysqlEnv(),
    outputFile: CURRENT_SCHEMA_PATH,
  });
  if (result.code !== 0) {
    throw new Error(result.stderr || 'mysqldump failed');
  }
  return {
    path: CURRENT_SCHEMA_PATH,
    completedAt: new Date().toISOString(),
  };
}

async function dropDatabase(dbName) {
  const args = [...mysqlBaseArgs(), '-e', `DROP DATABASE IF EXISTS \`${dbName}\`;`];
  await runCommand('mysql', args, { env: mysqlEnv() });
}

async function importReferenceSchema(tempDbName) {
  const hasMysql = await checkToolAvailability('mysql');
  if (!hasMysql) {
    throw new Error('mysql CLI is not available on this server');
  }
  const dropArgs = [
    ...mysqlBaseArgs(),
    '-e',
    `DROP DATABASE IF EXISTS \`${tempDbName}\`; CREATE DATABASE \`${tempDbName}\`;`,
  ];
  const dropRes = await runCommand('mysql', dropArgs, { env: mysqlEnv() });
  if (dropRes.code !== 0) {
    throw new Error(dropRes.stderr || 'Failed to prepare temp schema database');
  }

  const importArgs = [...mysqlBaseArgs(), tempDbName];
  const importRes = await runCommand('mysql', importArgs, {
    env: mysqlEnv(),
    stdinFile: REFERENCE_SCHEMA_PATH,
  });
  if (importRes.code !== 0) {
    throw new Error(importRes.stderr || 'Failed to import reference schema');
  }
}

function cleanMysqldbcompareSql(raw) {
  if (!raw) return '';
  const lines = raw.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('#')) return false;
    if (/^MySQL Utilities/i.test(trimmed)) return false;
    if (/^Comparing\s+/i.test(trimmed)) return false;
    return true;
  });
  return filtered.join('\n').trim();
}

async function buildTableScriptFromCompare(tempDbName, tableName) {
  const hasTool = await checkToolAvailability('mysqldbcompare');
  if (!hasTool) return '';
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '3306';
  const user = process.env.DB_USER || '';
  const args = [
    `--server1=${user}@${host}:${port}`,
    `--server2=${user}@${host}:${port}`,
    '--skip-row-count',
    '--run-all-tests',
    '--difftype=sql',
    '--changes-for=server2',
    '--force',
    `--include=^${tableName}$`,
    `${tempDbName}:${process.env.DB_NAME}`,
  ];
  const res = await runCommand('mysqldbcompare', args, {
    env: mysqlEnv(),
  });
  if (res.code !== 0 && !res.stdout && res.stderr) {
    return '';
  }
  return cleanMysqldbcompareSql(res.stdout || res.stderr);
}

function markDropRisk(sql) {
  if (!sql) return false;
  return /\bDROP\s+TABLE\b/i.test(sql) || /\bDROP\s+DATABASE\b/i.test(sql);
}

export async function compareSchemas({ tables = [] } = {}) {
  const dumpMeta = await dumpCurrentSchema();
  const [referenceSql, currentSql] = await Promise.all([
    fsPromises.readFile(REFERENCE_SCHEMA_PATH, 'utf8'),
    fsPromises.readFile(CURRENT_SCHEMA_PATH, 'utf8'),
  ]);

  const referenceTables = extractTableStatements(referenceSql);
  const currentTables = extractTableStatements(currentSql);
  const tableSet = new Set(tables && tables.length > 0 ? tables : []);
  if (tableSet.size === 0) {
    referenceTables.forEach((_, key) => tableSet.add(key));
    currentTables.forEach((_, key) => tableSet.add(key));
  }

  const tempDbName = `schema_ref_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const scripts = new Map();
  try {
    await importReferenceSchema(tempDbName);
    for (const table of tableSet) {
      const sql = await buildTableScriptFromCompare(tempDbName, table);
      if (sql) scripts.set(table, sql);
    }
  } catch {
    // fall back to reference statements below
  } finally {
    try {
      await dropDatabase(tempDbName);
    } catch {
      // ignore cleanup errors
    }
  }

  const results = [];
  for (const table of Array.from(tableSet).sort()) {
    const referenceStmt = referenceTables.get(table) || '';
    const currentStmt = currentTables.get(table) || '';
    let status = 'match';
    if (!currentStmt && referenceStmt) status = 'missing_in_current';
    else if (currentStmt && !referenceStmt) status = 'missing_in_reference';
    else if (
      referenceStmt &&
      currentStmt &&
      normalizeSql(referenceStmt) !== normalizeSql(currentStmt)
    )
      status = 'different';

    let script = scripts.get(table) || '';
    let source = script ? 'mysqldbcompare' : '';
    if (!script) {
      if (status === 'missing_in_current' && referenceStmt) {
        script = `-- Create missing table ${table}\n${referenceStmt}`;
        source = 'reference';
      } else if (status === 'missing_in_reference') {
        script = `-- Drop table not present in reference schema\nDROP TABLE IF EXISTS \`${table}\`;`;
        source = 'drop';
      } else if (status === 'different' && referenceStmt) {
        script = `-- Replace table ${table} with reference definition (may remove data)\nDROP TABLE IF EXISTS \`${table}\`;\n${referenceStmt}`;
        source = 'fallback';
      }
    }

    results.push({
      name: table,
      status,
      preview: buildDiffPreview(currentStmt, referenceStmt),
      script,
      source,
      hasDrop: markDropRisk(script),
    });
  }

  return {
    currentSchemaPath: CURRENT_SCHEMA_PATH,
    referenceSchemaPath: REFERENCE_SCHEMA_PATH,
    generatedAt: dumpMeta.completedAt,
    tables: results,
  };
}

export async function applySchemaChanges(changes, { allowDrops = false, dryRun = false } = {}) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { applied: 0, results: [] };
  }
  if (dryRun) {
    return {
      applied: 0,
      results: changes.map((c) => ({ table: c.table, skipped: true })),
      dryRun: true,
    };
  }

  const conn = await pool.getConnection();
  const outcomes = [];
  try {
    await conn.beginTransaction();
    for (const change of changes) {
      const table = change.table;
      const script = change.sql || change.script || '';
      const statements = splitSqlStatements(script);
      const failed = [];
      let appliedStatements = 0;
      for (const stmt of statements) {
        if (!stmt || !stmt.trim()) continue;
        if (!allowDrops && /^\s*DROP\s+/i.test(stmt)) {
          failed.push({ sql: stmt, error: 'DROP blocked by allowDrops=false' });
          continue;
        }
        try {
          await conn.query(stmt);
          appliedStatements += 1;
        } catch (err) {
          failed.push({ sql: stmt, error: err.message });
        }
      }
      outcomes.push({ table, appliedStatements, failed });
      if (failed.length > 0) {
        throw new Error(
          `Failed to apply schema change for ${table}: ${failed[0].error}`,
        );
      }
    }
    await conn.commit();
    return { applied: outcomes.length, results: outcomes };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export const paths = {
  reference: REFERENCE_SCHEMA_PATH,
  current: CURRENT_SCHEMA_PATH,
};

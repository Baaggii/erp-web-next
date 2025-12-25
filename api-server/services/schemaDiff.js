import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { pool } from '../../db/index.js';
import { getTableStructure } from './generatedSql.js';
import { getConfigBasePath } from '../utils/configPaths.js';

const execFileAsync = promisify(execFile);

const SCHEMA_FILE_PATH = path.resolve(process.cwd(), 'db', 'mgtmn_erp_db.sql');
const SCHEMA_DIFF_DIR = path.join(getConfigBasePath(), 'schema-diff');
const CURRENT_SCHEMA_PATH = path.join(SCHEMA_DIFF_DIR, 'current_schema.sql');

function normalizeSqlForCompare(sql = '') {
  return sql
    .replace(/\/\*![\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function binaryExists(cmd) {
  try {
    await execFileAsync('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

export async function getToolAvailability() {
  const [mysqldump, mysqldbcompare] = await Promise.all([
    binaryExists('mysqldump'),
    binaryExists('mysqldbcompare'),
  ]);
  return { mysqldump, mysqldbcompare };
}

function detectTableName(statement, fallbackTable = null) {
  const tableMatch =
    statement.match(/\b(?:CREATE|ALTER|DROP)\s+TABLE\s+`?([^`\s]+)`?/i) ||
    statement.match(/\bTABLE\s+`?([^`\s]+)`?/i);
  if (tableMatch) return tableMatch[1];

  const triggerMatch = statement.match(/\bON\s+`?([^`\s]+)`?/i);
  if (triggerMatch && /TRIGGER/i.test(statement)) return triggerMatch[1];

  return fallbackTable;
}

export function splitSqlStatements(sqlText = '') {
  const lines = sqlText.split(/\r?\n/);
  const statements = [];
  let delimiter = ';';
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) statements.push(trimmed);
    buffer = '';
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const delimMatch = line.match(/^\s*DELIMITER\s+(.+)\s*$/i);
    if (delimMatch) {
      flush();
      delimiter = delimMatch[1].trim();
      continue;
    }

    buffer += line + '\n';

    if (!buffer.trim()) continue;

    if (buffer.trimEnd().endsWith(delimiter)) {
      const stmt = buffer.trimEnd();
      const withoutDelim = stmt.slice(0, stmt.length - delimiter.length).trimEnd();
      statements.push(withoutDelim.trim());
      buffer = '';
    }
  }

  if (buffer.trim()) {
    statements.push(buffer.trim());
  }

  return statements;
}

function parseSchemaByTable(sqlText) {
  const statements = splitSqlStatements(sqlText);
  const map = new Map();
  let activeTable = null;

  for (const stmt of statements) {
    if (/^SET\s+/i.test(stmt) || /^START\s+TRANSACTION/i.test(stmt) || /^COMMIT/i.test(stmt)) {
      continue;
    }

    const table = detectTableName(stmt, activeTable);
    if (!table) continue;
    activeTable = table;
    if (!map.has(table)) map.set(table, []);
    const withSemicolon = stmt.endsWith(';') ? stmt : `${stmt};`;
    map.get(table).push(withSemicolon);
  }

  return map;
}

async function listCurrentTables() {
  const [rows] = await pool.query('SHOW TABLES');
  if (!rows || rows.length === 0) return [];
  const key = Object.keys(rows[0])[0];
  return rows.map((r) => r[key]);
}

async function getCurrentSchemaMap() {
  const tables = await listCurrentTables();
  const map = new Map();
  for (const table of tables) {
    const structure = await getTableStructure(table);
    map.set(table, structure || '');
  }
  return map;
}

export async function dumpCurrentSchema() {
  await fs.mkdir(SCHEMA_DIFF_DIR, { recursive: true });
  const tools = await getToolAvailability();
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 3306;
  const user = process.env.DB_USER || '';
  const database = process.env.DB_NAME || '';

  if (tools.mysqldump && user && database) {
    const args = [
      '--no-data',
      '--triggers',
      '--routines',
      '--skip-comments',
      '--single-transaction',
      '--set-gtid-purged=OFF',
      '--host',
      host,
      '--port',
      String(port),
      '--user',
      user,
      database,
    ];

    const env = { ...process.env };
    if (process.env.DB_PASS) {
      env.MYSQL_PWD = process.env.DB_PASS;
    }

    const { stdout } = await execFileAsync('mysqldump', args, {
      env,
      maxBuffer: 50 * 1024 * 1024,
    });
    await fs.writeFile(CURRENT_SCHEMA_PATH, stdout);
    return { path: CURRENT_SCHEMA_PATH, tool: 'mysqldump' };
  }

  const map = await getCurrentSchemaMap();
  const parts = [];
  for (const [table, sql] of map.entries()) {
    parts.push(`-- Structure for ${table}`);
    parts.push(`DROP TABLE IF EXISTS \`${table}\`;`);
    parts.push(sql.trim().endsWith(';') ? sql.trim() : `${sql.trim()};`);
  }
  await fs.writeFile(CURRENT_SCHEMA_PATH, parts.join('\n\n'));
  return { path: CURRENT_SCHEMA_PATH, tool: 'mysql2' };
}

async function generateToolScript(schemaContent) {
  const tools = await getToolAvailability();
  if (!tools.mysqldbcompare) {
    return { rawScript: '', statementsByTable: new Map(), tool: null, error: 'mysqldbcompare not installed' };
  }

  const schemaByTable = parseSchemaByTable(schemaContent);
  const allStatements = Array.from(schemaByTable.values()).flat();
  const referenceDb = `schema_diff_ref_${crypto.randomBytes(4).toString('hex')}`;
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 3306;
  const user = process.env.DB_USER || '';
  const database = process.env.DB_NAME || '';

  const conn = await pool.getConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${referenceDb}\``);
    await conn.query(`CREATE DATABASE \`${referenceDb}\``);
    await conn.changeUser({ database: referenceDb });
    for (const stmt of allStatements) {
      try {
        await conn.query(stmt);
      } catch {
        // Ignore errors while hydrating reference schema; mysqldbcompare will catch differences
      }
    }
  } finally {
    conn.release();
  }

  try {
    const env = { ...process.env };
    if (process.env.DB_PASS) env.MYSQL_PWD = process.env.DB_PASS;

    const args = [
      '--server1', `${user}@${host}:${port}`,
      '--server2', `${user}@${host}:${port}`,
      '--run-all-tests',
      '--difftype=SQL',
      '--changes-for=server1',
      `${database}:${referenceDb}`,
    ];

    const { stdout } = await execFileAsync('mysqldbcompare', args, {
      env,
      maxBuffer: 50 * 1024 * 1024,
    });

    const statements = splitSqlStatements(stdout);
    const byTable = new Map();
    let activeTable = null;
    for (const stmt of statements) {
      const table = detectTableName(stmt, activeTable);
      if (!table) continue;
      activeTable = table;
      if (!byTable.has(table)) byTable.set(table, []);
      byTable.get(table).push(stmt.endsWith(';') ? stmt : `${stmt};`);
    }

    return { rawScript: stdout, statementsByTable: byTable, tool: 'mysqldbcompare', error: null };
  } catch (err) {
    return {
      rawScript: '',
      statementsByTable: new Map(),
      tool: 'mysqldbcompare',
      error: err?.message || 'mysqldbcompare failed',
    };
  } finally {
    await pool.query(`DROP DATABASE IF EXISTS \`${referenceDb}\``);
  }
}

export async function buildSchemaDiff(options = {}) {
  const { useCompareTool = false } = options;
  const dumpInfo = await dumpCurrentSchema();
  const tools = await getToolAvailability();

  const schemaContent = await fs.readFile(SCHEMA_FILE_PATH, 'utf8');
  const targetMap = parseSchemaByTable(schemaContent);
  const currentMap = await getCurrentSchemaMap();

  const toolResult = useCompareTool ? await generateToolScript(schemaContent) : null;

  const tables = [];
  let missing = 0;
  let different = 0;
  let matching = 0;

  for (const [table, statements] of targetMap.entries()) {
    const targetSql = statements.join('\n\n');
    const currentSql = currentMap.get(table) || '';
    const same = currentMap.has(table)
      ? normalizeSqlForCompare(targetSql) === normalizeSqlForCompare(currentSql)
      : false;

    const status = !currentMap.has(table) ? 'missing' : same ? 'match' : 'different';
    if (status === 'missing') missing += 1;
    if (status === 'different') different += 1;
    if (status === 'match') matching += 1;

    const toolStatements = toolResult?.statementsByTable.get(table) || [];
    const hasDrop = statements.some((stmt) => /DROP\s+TABLE/i.test(stmt));

    tables.push({
      name: table,
      status,
      targetSql,
      currentSql,
      statements,
      toolStatements,
      hasDrop,
    });
  }

  const extraTables = Array.from(currentMap.keys()).filter((t) => !targetMap.has(t));

  return {
    generatedAt: new Date().toISOString(),
    schemaPath: SCHEMA_FILE_PATH,
    dumpInfo,
    tools,
    tables,
    extraTables,
    summary: {
      missing,
      different,
      matching,
      extra: extraTables.length,
    },
    toolError: toolResult?.error || null,
    toolScript: toolResult?.rawScript || '',
  };
}

export async function getSchemaDiffStatus() {
  const tools = await getToolAvailability();
  const status = { schemaPath: SCHEMA_FILE_PATH, tools };
  try {
    const stats = await fs.stat(SCHEMA_FILE_PATH);
    status.schemaExists = stats.isFile();
    status.schemaSize = stats.size;
    status.schemaModifiedAt = stats.mtime.toISOString();
  } catch {
    status.schemaExists = false;
  }

  try {
    const stats = await fs.stat(CURRENT_SCHEMA_PATH);
    status.dumpExists = stats.isFile();
    status.dumpPath = CURRENT_SCHEMA_PATH;
    status.dumpModifiedAt = stats.mtime.toISOString();
  } catch {
    status.dumpExists = false;
    status.dumpPath = CURRENT_SCHEMA_PATH;
  }

  return status;
}

export async function applySchemaChanges(statements = [], options = {}) {
  const { allowDrops = false, dryRun = false } = options;
  if (!Array.isArray(statements) || statements.length === 0) {
    return { applied: 0, skippedDrops: 0, failed: [], durationMs: 0 };
  }

  const filtered = statements
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .filter((s) => allowDrops || !/^DROP\s+TABLE/i.test(s));

  const skippedDrops = statements.length - filtered.length;
  if (dryRun) {
    return { applied: 0, skippedDrops, failed: [], durationMs: 0, statements: filtered };
  }

  const conn = await pool.getConnection();
  const start = Date.now();
  let current = '';
  try {
    await conn.beginTransaction();
    for (const stmt of filtered) {
      current = stmt;
      await conn.query(stmt);
    }
    await conn.commit();
    return { applied: filtered.length, skippedDrops, failed: [], durationMs: Date.now() - start };
  } catch (err) {
    await conn.rollback();
    return {
      applied: 0,
      skippedDrops,
      failed: [{ sql: current, error: err?.message || 'Unknown error' }],
      durationMs: Date.now() - start,
    };
  } finally {
    conn.release();
  }
}

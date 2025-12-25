import {
  listDatabaseTables,
  listTableColumnsDetailed,
  pool,
} from '../../db/index.js';
import { formatDateForDb } from '../utils/formatDate.js';

const LOG_TABLE = 'json_conversion_log';

function escapeIdentifier(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function formatStatement(sql, params = []) {
  if (typeof pool.format === 'function') {
    try {
      return pool.format(sql, params);
    } catch {
      // fall back to manual formatting below
    }
  }
  let idx = 0;
  return sql.replace(/\?/g, () => {
    const value = idx < params.length ? params[idx] : '?';
    idx += 1;
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) return `'${formatDateForDb(value)}'`;
    return `'${String(value).replace(/'/g, "\\'")}'`;
  });
}

export async function ensureJsonConversionLog() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      table_name VARCHAR(255) NOT NULL,
      column_name VARCHAR(255) NOT NULL,
      script_text LONGTEXT NOT NULL,
      run_at DATETIME NULL,
      run_by VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_table_column (table_name, column_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  );
}

export async function listTablesWithJsonInfo() {
  await ensureJsonConversionLog();
  const [logRows] = await pool.query(
    `SELECT DISTINCT table_name FROM ${LOG_TABLE}`,
  );
  const tables = await listDatabaseTables();
  const logged = new Set(
    logRows
      .map((r) => (r?.table_name ? String(r.table_name).toLowerCase() : ''))
      .filter(Boolean),
  );
  return tables.map((name) => ({
    name,
    hasConversions: logged.has(String(name).toLowerCase()),
  }));
}

export async function listConversionLogs() {
  await ensureJsonConversionLog();
  const [rows] = await pool.query(
    `SELECT id, table_name, column_name, script_text, run_at, run_by, created_at
       FROM ${LOG_TABLE}
      ORDER BY COALESCE(run_at, created_at) DESC, id DESC`,
  );
  return rows;
}

export async function getConversionLogMap() {
  await ensureJsonConversionLog();
  const [rows] = await pool.query(
    `SELECT table_name, column_name FROM ${LOG_TABLE}`,
  );
  const map = new Map();
  rows.forEach((row) => {
    const table = String(row.table_name || '').toLowerCase();
    const column = String(row.column_name || '').toLowerCase();
    if (!table || !column) return;
    if (!map.has(table)) map.set(table, new Set());
    map.get(table).add(column);
  });
  return map;
}

function findAvailableName(base, existing) {
  let candidate = base;
  let counter = 1;
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  existing.add(candidate.toLowerCase());
  return candidate;
}

export async function listJsonAwareColumns(tableName) {
  const [columns, logMap] = await Promise.all([
    listTableColumnsDetailed(tableName),
    getConversionLogMap(),
  ]);
  const loggedColumns =
    logMap.get(String(tableName || '').toLowerCase()) || new Set();
  return columns.map((col) => {
    const rawType = (col.type || col.columnType || '').toLowerCase();
    const isJson =
      rawType.includes('json') ||
      loggedColumns.has(String(col.name || '').toLowerCase());
    return {
      ...col,
      isJson,
    };
  });
}

function buildColumnPlan(tableName, columnMeta, { keepBackup = false } = {}) {
  const existing = new Set(
    columnMeta.map((c) => String(c.name || '').toLowerCase()),
  );
  const plans = [];
  columnMeta.forEach((col) => {
    const rawType = (col.type || col.columnType || '').toLowerCase();
    if (rawType.includes('json')) return;
    const columnName = col.name;
    const tempName = findAvailableName(`${columnName}_json_tmp`, existing);
    const backupName = keepBackup
      ? findAvailableName(`${columnName}_scalar_backup`, existing)
      : null;

    const statements = [];
    if (backupName) {
      statements.push({
        sql: `ALTER TABLE ${escapeIdentifier(tableName)} ADD COLUMN ${escapeIdentifier(
          backupName,
        )} ${col.columnType || col.type || 'TEXT'}`,
      });
      statements.push({
        sql: `UPDATE ${escapeIdentifier(tableName)} SET ${escapeIdentifier(
          backupName,
        )} = ${escapeIdentifier(columnName)}`,
      });
    }
    statements.push({
      sql: `ALTER TABLE ${escapeIdentifier(tableName)} ADD COLUMN ${escapeIdentifier(
        tempName,
      )} JSON`,
    });
    statements.push({
      sql: `UPDATE ${escapeIdentifier(tableName)} SET ${escapeIdentifier(
        tempName,
      )} = JSON_ARRAY(${escapeIdentifier(columnName)}) WHERE ${escapeIdentifier(
        columnName,
      )} IS NOT NULL`,
    });
    statements.push({
      sql: `ALTER TABLE ${escapeIdentifier(tableName)} DROP COLUMN ${escapeIdentifier(
        columnName,
      )}`,
    });
    statements.push({
      sql: `ALTER TABLE ${escapeIdentifier(tableName)} CHANGE COLUMN ${escapeIdentifier(
        tempName,
      )} ${escapeIdentifier(columnName)} JSON`,
    });

    plans.push({
      column: columnName,
      backupName,
      statements,
      scriptText: statements.map((s) => s.sql).join(';\n'),
      preview: `"value" → ["value"]`,
    });
  });
  return plans;
}

export async function buildConversionPlan(tableName, columns, options = {}) {
  const normalizedCols = Array.isArray(columns)
    ? Array.from(
        new Set(
          columns
            .map((c) => (c ? String(c).trim() : ''))
            .filter(Boolean)
            .map((c) => c.toLowerCase()),
        ),
      )
    : [];
  if (normalizedCols.length === 0) {
    const err = new Error('No columns selected');
    err.status = 400;
    throw err;
  }
  const meta = await listTableColumnsDetailed(tableName);
  const metaMap = new Map();
  meta.forEach((col) => {
    metaMap.set(String(col.name || '').toLowerCase(), col);
  });
  const targets = normalizedCols.map((name) => {
    const col = metaMap.get(name);
    if (!col) {
      const err = new Error(`Column ${name} not found`);
      err.status = 404;
      throw err;
    }
    const rawType = (col.type || col.columnType || '').toLowerCase();
    if (rawType.includes('json')) {
      const err = new Error(`Column ${col.name} is already JSON`);
      err.status = 400;
      throw err;
    }
    return col;
  });
  const plans = buildColumnPlan(tableName, targets, {
    keepBackup: options.keepBackup,
  });
  const combinedStatements = plans.flatMap((p) => p.statements);
  const scriptText = combinedStatements.map((s) => s.sql).join(';\n');
  return { plans, statements: combinedStatements, scriptText };
}

async function runStatements(statements) {
  if (!Array.isArray(statements) || statements.length === 0) return;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of statements) {
      if (!stmt?.sql) continue;
      // eslint-disable-next-line no-await-in-loop
      await conn.query(stmt.sql, stmt.params || []);
    }
    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback failure
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function executeConversion(tableName, columns, options = {}) {
  const { plans, statements, scriptText } = await buildConversionPlan(
    tableName,
    columns,
    options,
  );
  if (options.execute !== false) {
    await runStatements(statements);
  }
  await ensureJsonConversionLog();
  const runAt =
    options.execute === false ? null : formatDateForDb(new Date());
  for (const plan of plans) {
    const text = plan.statements.map((s) => formatStatement(s.sql, s.params)).join(';\n');
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO ${LOG_TABLE} (table_name, column_name, script_text, run_at, run_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        tableName,
        plan.column,
        text,
        runAt,
        options.actor || null,
      ],
    );
  }
  return { plans, scriptText, executed: options.execute !== false, runAt };
}

export async function rerunScript(id, actor = null) {
  await ensureJsonConversionLog();
  const [rows] = await pool.query(
    `SELECT id, script_text FROM ${LOG_TABLE} WHERE id = ? LIMIT 1`,
    [id],
  );
  const entry = rows?.[0];
  if (!entry) {
    const err = new Error('Script not found');
    err.status = 404;
    throw err;
  }
  const statements = String(entry.script_text || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (statements.length === 0) {
    const err = new Error('Script has no statements');
    err.status = 400;
    throw err;
  }
  await runStatements(statements.map((sql) => ({ sql })));
  await pool.query(
    `UPDATE ${LOG_TABLE}
        SET run_at = ?, run_by = ?
      WHERE id = ?`,
    [formatDateForDb(new Date()), actor || null, id],
  );
  return { id, runBy: actor };
}

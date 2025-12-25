import { pool } from '../../db/index.js';

function escapeId(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

async function ensureLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS json_conversion_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      table_name VARCHAR(255) NOT NULL,
      column_name VARCHAR(255) NOT NULL,
      script_text MEDIUMTEXT NOT NULL,
      run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      run_by VARCHAR(255)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

export async function listTables() {
  const [rows] = await pool.query('SHOW TABLES');
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const firstKey = Object.keys(rows[0] || {})[0];
  return rows.map((r) => r[firstKey]).filter(Boolean);
}

export async function listColumns(table) {
  const [rows] = await pool.query('SHOW COLUMNS FROM ??', [table]);
  return rows.map((row) => ({
    name: row.Field,
    type: row.Type,
    nullable: row.Null === 'YES',
    key: row.Key,
    defaultValue: row.Default,
    extra: row.Extra,
  }));
}

function buildColumnStatements(table, columnName, columnMeta, options, existingColumns = []) {
  const tableId = escapeId(table);
  const columnId = escapeId(columnName);
  const backupName = options.backup ? `${columnName}_scalar_backup` : null;
  const backupId = backupName ? escapeId(backupName) : null;
  const baseType = columnMeta?.type || 'TEXT';
  const statements = [];
  const existing = new Set(existingColumns.map((c) => String(c).toLowerCase()));
  const backupExists = backupName ? existing.has(backupName.toLowerCase()) : false;

  if (backupId && !backupExists) {
    statements.push(
      `ALTER TABLE ${tableId} ADD COLUMN ${backupId} ${baseType} NULL`,
    );
  }
  if (backupId) {
    statements.push(`UPDATE ${tableId} SET ${backupId} = ${columnId}`);
  }

  statements.push(`ALTER TABLE ${tableId} MODIFY COLUMN ${columnId} JSON`);
  const sourceRef = backupId || columnId;
  statements.push(
    `UPDATE ${tableId} SET ${columnId} = JSON_ARRAY(${sourceRef}) WHERE ${sourceRef} IS NOT NULL`,
  );

  const preview = {
    column: columnName,
    originalType: columnMeta?.type || 'UNKNOWN',
    exampleBefore: '123',
    exampleAfter: '["123"]',
    backupColumn: backupName,
    notes: backupName
      ? backupExists
        ? `Existing backup column ${backupName} will be reused before conversion.`
        : `Original values will be stored in ${backupName} before conversion.`
      : 'Conversion will run without keeping a dedicated backup column.',
  };

  return { statements, preview };
}

function normalizeStatement(stmt = '') {
  return String(stmt).replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN');
}

function normalizeStatements(statements = []) {
  return statements.map((stmt) => normalizeStatement(stmt));
}

export function buildConversionPlan(table, columns, metadata, options = {}) {
  const plan = { statements: [], previews: [] };
  const existingColumnNames = metadata.map((m) => m.name);
  columns.forEach((col) => {
    const meta = metadata.find((m) => m.name === col) || {};
    const { statements, preview } = buildColumnStatements(
      table,
      col,
      meta,
      options,
      existingColumnNames,
    );
    plan.statements.push(...statements);
    plan.previews.push(preview);
  });
  plan.statements = normalizeStatements(plan.statements);
  plan.scriptText = plan.statements.map((s) => `${s};`).join('\n');
  return plan;
}

export async function runPlanStatements(statements) {
  const normalized = normalizeStatements(statements);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of normalized) {
      await conn.query(stmt);
    }
    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    try {
      conn.release();
    } catch {
      // ignore release errors
    }
  }
}

export async function recordConversionLog(table, columns, scriptText, runBy) {
  await ensureLogTable();
  const columnName = Array.isArray(columns) ? columns.join(',') : String(columns || '');
  const [result] = await pool.query(
    `INSERT INTO json_conversion_log (table_name, column_name, script_text, run_at, run_by)
     VALUES (?, ?, ?, NOW(), ?)`,
    [table, columnName, scriptText, runBy || null],
  );
  return result.insertId;
}

export async function listSavedScripts() {
  await ensureLogTable();
  const [rows] = await pool.query(
    `SELECT id, table_name, column_name, script_text, run_at, run_by
     FROM json_conversion_log
     ORDER BY run_at DESC
     LIMIT 200`,
  );
  return rows;
}

export async function getSavedScript(id) {
  await ensureLogTable();
  const [rows] = await pool.query(
    `SELECT id, table_name, column_name, script_text, run_at, run_by
     FROM json_conversion_log
     WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

export async function touchScriptRun(id, runBy) {
  await ensureLogTable();
  await pool.query(
    `UPDATE json_conversion_log
     SET run_at = NOW(), run_by = ?
     WHERE id = ?`,
    [runBy || null, id],
  );
}

export function splitStatements(scriptText) {
  const raw = String(scriptText || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((stmt) => `${stmt};`);
  return normalizeStatements(raw);
}

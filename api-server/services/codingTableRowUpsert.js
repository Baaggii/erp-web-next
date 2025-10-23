import { pool } from '../../db/index.js';

const TRANSACTION_TYPE_TABLES = new Set([
  'transactions_income',
  'transactions_expense',
  'transactions_order',
  'transactions_plan',
]);

function findKey(row, key) {
  const lower = String(key).toLowerCase();
  return Object.keys(row || {}).find((k) => String(k).toLowerCase() === lower);
}

function getCaseInsensitive(row, key) {
  const actual = findKey(row, key);
  return actual ? row[actual] : undefined;
}

function setCaseInsensitive(row, key, value) {
  const actual = findKey(row, key);
  const targetKey = actual || key;
  if (row) {
    row[targetKey] = value;
  }
}

async function applyDynamicFields(conn, table, row) {
  const lower = String(table || '').toLowerCase();
  if (!TRANSACTION_TYPE_TABLES.has(lower)) return;
  const transType = getCaseInsensitive(row, 'TransType');
  if (transType === undefined || transType === null || transType === '') return;
  const [rows] = await conn.query(
    'SELECT UITransTypeName, UITrtype FROM code_transaction WHERE UITransType = ? LIMIT 1',
    [transType],
  );
  if (!rows || rows.length === 0) return;
  const info = rows[0];
  setCaseInsensitive(row, 'TRTYPENAME', info.UITransTypeName);
  setCaseInsensitive(row, 'trtype', info.UITrtype);
}

function sanitizeTable(table) {
  return String(table || '').replace(/[^A-Za-z0-9_]+/g, '');
}

function escapeRegex(source) {
  return String(source || '').replace(/[.*+?^${}()|[\]\\]/g, '\$&');
}

async function dropSelfReferentialTriggers(conn, table) {
  if (!conn || !table) return;
  const [rows] = await conn.query(
    `SELECT TRIGGER_NAME, ACTION_STATEMENT FROM information_schema.triggers WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = ?`,
    [table],
  );
  if (!Array.isArray(rows) || rows.length === 0) return;
  const pattern = new RegExp('\\bUPDATE\\s+`?' + escapeRegex(table) + '`?\\b', 'i');
  for (const trigger of rows) {
    const statement = trigger?.ACTION_STATEMENT || '';
    if (!statement || !pattern.test(statement)) continue;
    const name = trigger?.TRIGGER_NAME;
    if (!name) continue;
    const safeName = String(name).replace(/`/g, '``');
    await conn.query(`DROP TRIGGER IF EXISTS \`${safeName}\``);
  }
}

export async function upsertCodingTableRow(table, row) {
  if (!table || !row || typeof row !== 'object') {
    throw new Error('table and row required');
  }
  const cleanTable = sanitizeTable(table);
  if (!cleanTable) {
    throw new Error('Invalid table name');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await dropSelfReferentialTriggers(conn, cleanTable);
    const payload = { ...row };
    await applyDynamicFields(conn, cleanTable, payload);
    const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      await conn.commit();
      return { inserted: 0, insertId: null };
    }
    const columns = entries.map(([col]) => `\`${col}\``).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    const updates = entries
      .map(([col]) => `\`${col}\`=VALUES(\`${col}\`)`)
      .join(', ');
    const values = entries.map(([, value]) => (value === undefined ? null : value));
    const [result] = await conn.query(
      `INSERT INTO \`${cleanTable}\` (${columns}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );
    await conn.commit();
    const affected = typeof result.affectedRows === 'number' ? result.affectedRows : 0;
    const inserted = affected > 0 ? 1 : 0;
    const insertId =
      result.insertId && result.insertId !== 0 ? result.insertId : getCaseInsensitive(payload, 'id') ?? null;
    return { inserted, insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export default upsertCodingTableRow;

const TRANSACTION_TYPE_TABLES = new Set([
  'transactions_income',
  'transactions_expense',
  'transactions_order',
  'transactions_plan',
]);

function findCaseInsensitiveKey(row, key) {
  if (!row || typeof row !== 'object') return undefined;
  const lower = String(key || '').toLowerCase();
  return Object.keys(row).find((k) => String(k).toLowerCase() === lower);
}

export function getCaseInsensitive(row, key) {
  const actual = findCaseInsensitiveKey(row, key);
  return actual ? row[actual] : undefined;
}

function setCaseInsensitive(row, key, value) {
  if (!row || typeof row !== 'object') return;
  const actual = findCaseInsensitiveKey(row, key) || key;
  row[actual] = value;
}

export function sanitizeTableName(table) {
  return String(table || '').replace(/[^A-Za-z0-9_]+/g, '');
}

function escapeRegex(source) {
  return String(source || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function dropSelfReferentialTriggers(conn, table) {
  if (!conn || !table) return;
  const cleanTable = sanitizeTableName(table);
  if (!cleanTable) return;
  if (!conn.__droppedSelfReferentialTables) {
    conn.__droppedSelfReferentialTables = new Set();
  }
  if (conn.__droppedSelfReferentialTables.has(cleanTable)) {
    return;
  }
  const [rows] = await conn.query(
    `SELECT TRIGGER_NAME, ACTION_STATEMENT FROM information_schema.triggers WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = ?`,
    [cleanTable],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    conn.__droppedSelfReferentialTables.add(cleanTable);
    return;
  }
  const lowerTable = cleanTable.toLowerCase();
  const pattern = new RegExp(
    '\\bUPDATE\\s+(?:(?:\\w+|`[^`]+`)\\.)?`?' + escapeRegex(cleanTable) + '`?\\b',
    'i',
  );
  for (const trigger of rows) {
    const statement = trigger?.ACTION_STATEMENT || '';
    if (!statement) continue;
    const normalized = String(statement).replace(/`/g, '').toLowerCase();
    const referencesSelf =
      pattern.test(statement) || normalized.includes(`update ${lowerTable}`);
    if (!referencesSelf) continue;
    const name = trigger?.TRIGGER_NAME;
    if (!name) continue;
    const safeName = String(name).replace(/`/g, '``');
    await conn.query(`DROP TRIGGER IF EXISTS \`${safeName}\``);
  }
  conn.__droppedSelfReferentialTables.add(cleanTable);
}

export async function applyDynamicTransactionFields(conn, table, row) {
  if (!conn || !row || typeof row !== 'object') return;
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

export default {
  getCaseInsensitive,
  sanitizeTableName,
  dropSelfReferentialTriggers,
  applyDynamicTransactionFields,
};

import { pool } from '../../db/index.js';

const tableColumnCache = new Map();

// IMPORTANT:
// Backend is schema-authoritative.
// UI (including Codex-generated UI) may send extra fields.
// Only real table columns are allowed past this point.
async function getTableColumnMap(tableName, db = pool) {
  if (!tableName) return new Map();
  const trimmedName = String(tableName).trim();
  if (!trimmedName) return new Map();
  const cacheKey = trimmedName.toLowerCase();
  if (tableColumnCache.has(cacheKey)) {
    return tableColumnCache.get(cacheKey);
  }
  const [rows] = await db.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [trimmedName],
  );
  const map = new Map();
  for (const row of rows || []) {
    const column = row?.COLUMN_NAME;
    if (column) {
      map.set(String(column).toLowerCase(), column);
    }
  }
  tableColumnCache.set(cacheKey, map);
  return map;
}

function normalizeRowKey(rawKey) {
  if (rawKey === undefined || rawKey === null) return '';
  const key = typeof rawKey === 'string' ? rawKey.trim() : String(rawKey || '');
  if (!key) return '';
  if (key.includes('.')) {
    const parts = key.split('.').filter(Boolean);
    return parts.length ? parts[parts.length - 1].trim() : '';
  }
  return key;
}

export async function sanitizeRowForTable(row, tableName, db = pool) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
  const columnMap = await getTableColumnMap(tableName, db);
  if (!columnMap || columnMap.size === 0) return {};
  const sanitized = {};
  for (const [rawKey, value] of Object.entries(row)) {
    if (value === undefined) continue;
    const normalizedKey = normalizeRowKey(rawKey);
    if (!normalizedKey) continue;
    const columnName = columnMap.get(normalizedKey.toLowerCase());
    if (!columnName) continue;
    sanitized[columnName] = value;
  }
  return sanitized;
}


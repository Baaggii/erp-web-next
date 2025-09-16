import { pool, listTableColumns } from '../../db/index.js';
import { formatDateForDb } from '../utils/formatDate.js';

function buildColumnMap(columns = []) {
  const map = new Map();
  columns.forEach((col) => {
    map.set(String(col).toLowerCase(), col);
  });
  return map;
}

function normalizeRow(row = {}, columnMap, companyId, user) {
  const normalized = {};
  const userId = user?.empid ?? user?.id ?? null;
  for (const [key, value] of Object.entries(row)) {
    const colName = columnMap.get(String(key).toLowerCase());
    if (!colName) continue;
    if (value === undefined) {
      normalized[colName] = null;
    } else if (value === '') {
      normalized[colName] = null;
    } else {
      normalized[colName] = value;
    }
  }
  if (columnMap.has('company_id') && normalized.company_id == null && companyId != null) {
    normalized.company_id = companyId;
  }
  if (columnMap.has('created_by') && normalized.created_by == null) {
    normalized.created_by = userId;
  }
  if (columnMap.has('updated_by') && normalized.updated_by == null) {
    normalized.updated_by = userId;
  }
  const now = formatDateForDb(new Date());
  if (columnMap.has('created_at') && normalized.created_at == null) {
    normalized.created_at = now;
  }
  if (columnMap.has('updated_at') && normalized.updated_at == null) {
    normalized.updated_at = now;
  }
  return normalized;
}

export async function postCodingTableRows(
  table,
  rows = [],
  user,
  companyId = 0,
  signal,
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, errors: [], errorGroups: {} };
  }
  const columns = await listTableColumns(table);
  const columnMap = buildColumnMap(columns);
  const conn = await pool.getConnection();
  let inserted = 0;
  const errors = [];
  try {
    await conn.beginTransaction();
    for (let i = 0; i < rows.length; i += 1) {
      if (signal?.aborted) {
        const abortError = new Error('Request aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }
      const raw = rows[i];
      if (!raw || typeof raw !== 'object') continue;
      const normalized = normalizeRow(raw, columnMap, companyId, user);
      const keys = Object.keys(normalized);
      if (keys.length === 0) continue;
      const colsClause = keys.map((c) => `\`${c}\``).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const updateClause = keys
        .map((c) => `\`${c}\`=VALUES(\`${c}\`)`)
        .join(', ');
      const values = keys.map((c) => normalized[c]);
      try {
        const [result] = await conn.query(
          {
            sql: `INSERT INTO \`${table}\` (${colsClause}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`,
            values,
            signal,
          },
        );
        const affected = typeof result.affectedRows === 'number' ? result.affectedRows : 0;
        const changed = typeof result.changedRows === 'number' ? result.changedRows : 0;
        inserted += affected - changed;
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw err;
        }
        errors.push({ index: i, error: err.message });
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const errorGroups = {};
  errors.forEach((entry) => {
    const key = entry?.error || 'Unknown error';
    errorGroups[key] = (errorGroups[key] || 0) + 1;
  });
  return { inserted, errors, errorGroups };
}

export default postCodingTableRows;

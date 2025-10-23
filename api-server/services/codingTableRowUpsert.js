import { pool } from '../../db/index.js';
import {
  getCaseInsensitive,
  sanitizeTableName,
  dropSelfReferentialTriggers,
  applyDynamicTransactionFields,
} from './transactionTableUtils.js';

export async function upsertCodingTableRow(table, row) {
  if (!table || !row || typeof row !== 'object') {
    throw new Error('table and row required');
  }
  const cleanTable = sanitizeTableName(table);
  if (!cleanTable) {
    throw new Error('Invalid table name');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const payload = { ...row };
    await dropSelfReferentialTriggers(conn, cleanTable);
    await applyDynamicTransactionFields(conn, cleanTable, payload);
    const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      await conn.commit();
      return { inserted: 0, insertId: null };
    }
    const escapeColumn = (col) => `\`${String(col).replace(/`/g, '``')}\``;
    const columns = entries.map(([col]) => escapeColumn(col)).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    const updates = entries
      .map(([col]) => `${escapeColumn(col)}=VALUES(${escapeColumn(col)})`)
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

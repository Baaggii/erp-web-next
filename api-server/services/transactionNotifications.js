import { pool } from '../../db/index.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parseNotificationCursor(cursor) {
  if (!cursor) return null;
  if (typeof cursor === 'object' && cursor.createdAt && cursor.id) {
    return cursor;
  }
  const raw = String(cursor);
  const [createdAt, id] = raw.split('|');
  if (!createdAt || !id) return null;
  return { createdAt, id: Number(id) };
}

export function serializeNotificationCursor(cursor) {
  if (!cursor?.createdAt || cursor?.id == null) return null;
  return `${cursor.createdAt}|${cursor.id}`;
}

export async function listTransactionNotifications({
  empId,
  companyId,
  limit = DEFAULT_LIMIT,
  cursor = null,
}) {
  const normalizedLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const params = [String(empId), Number(companyId)];
  let cursorClause = '';
  if (cursor?.createdAt && cursor?.id != null) {
    cursorClause =
      ' AND (created_at < ? OR (created_at = ? AND notification_id < ?))';
    params.push(cursor.createdAt, cursor.createdAt, Number(cursor.id));
  }
  params.push(normalizedLimit);
  const [rows] = await pool.query(
    `SELECT notification_id, transaction_name, transaction_table, transaction_record_id,
            action, summary, message, is_read, created_at
     FROM notifications
     WHERE recipient_empid = ?
       AND company_id = ?
       AND type = 'transaction'
       AND deleted_at IS NULL
       ${cursorClause}
     ORDER BY created_at DESC, notification_id DESC
     LIMIT ?`,
    params,
  );
  const normalizedRows = rows.map((row) => ({
    id: row.notification_id,
    transactionName: row.transaction_name || 'Other transaction',
    tableName: row.transaction_table,
    recordId: row.transaction_record_id,
    action: row.action,
    summary: row.summary || row.message,
    message: row.message,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  }));
  const last = normalizedRows[normalizedRows.length - 1];
  const nextCursor =
    normalizedRows.length === normalizedLimit && last
      ? serializeNotificationCursor({
          createdAt: last.createdAt,
          id: last.id,
        })
      : null;
  return { rows: normalizedRows, nextCursor };
}

export async function markTransactionNotificationRead({
  notificationId,
  empId,
  companyId,
}) {
  const [result] = await pool.query(
    `UPDATE notifications
     SET is_read = 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE notification_id = ?
       AND recipient_empid = ?
       AND company_id = ?
       AND type = 'transaction'`,
    [String(empId), notificationId, String(empId), Number(companyId)],
  );
  return result?.affectedRows > 0;
}

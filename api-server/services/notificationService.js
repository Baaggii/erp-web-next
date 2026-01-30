import { pool } from '../../db/index.js';

function normalizePaging(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

export async function listTransactionNotifications(
  {
    empid,
    page = 1,
    perPage = 10,
    unreadOnly = false,
  } = {},
) {
  if (!empid) return { rows: [], page: 1, perPage, total: 0 };
  const normalizedPage = normalizePaging(page, 1);
  const normalizedPerPage = Math.min(normalizePaging(perPage, 10), 100);
  const offset = (normalizedPage - 1) * normalizedPerPage;

  const where = ['recipient_empid = ?', "type = 'transaction'", 'deleted_at IS NULL'];
  const params = [empid];
  if (unreadOnly) {
    where.push('is_read = 0');
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT notification_id,
            recipient_empid,
            transaction_name,
            transaction_table,
            record_id,
            action,
            message,
            is_read,
            created_at
       FROM notifications
       ${whereClause}
      ORDER BY created_at DESC, notification_id DESC
      LIMIT ? OFFSET ?`,
    [...params, normalizedPerPage, offset],
  );

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM notifications
       ${whereClause}`,
    params,
  );

  return {
    rows,
    page: normalizedPage,
    perPage: normalizedPerPage,
    total: countRow?.total ?? rows.length,
  };
}

export async function getTransactionUnreadCount(empid) {
  if (!empid) return 0;
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM notifications
      WHERE recipient_empid = ?
        AND type = 'transaction'
        AND is_read = 0
        AND deleted_at IS NULL`,
    [empid],
  );
  return row?.total ?? 0;
}

export async function markNotificationRead(notificationId, empid) {
  if (!notificationId || !empid) return false;
  const [result] = await pool.query(
    `UPDATE notifications
        SET is_read = 1
      WHERE notification_id = ?
        AND recipient_empid = ?`,
    [notificationId, empid],
  );
  return result?.affectedRows > 0;
}

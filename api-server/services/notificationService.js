import { pool } from '../../db/index.js';

function parseTransactionName(message) {
  if (typeof message !== 'string') return '';
  const match = message.match(/^\[([^\]]+)\]/);
  return match ? match[1].trim() : '';
}

export async function listNotifications({
  recipientEmpId,
  companyId,
  limit = 25,
  includeRead = true,
} = {}) {
  if (!recipientEmpId) return { notifications: [], unreadCount: 0 };
  const normalizedLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const params = [companyId ?? null, recipientEmpId];
  let where = 'company_id = ? AND recipient_empid = ? AND deleted_at IS NULL';
  if (!includeRead) {
    where += ' AND is_read = 0';
  }
  const [rows] = await pool.query(
    `SELECT notification_id,
            recipient_empid,
            type,
            related_id,
            message,
            is_read,
            created_at,
            created_by
       FROM notifications
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ?`,
    [...params, normalizedLimit],
  );
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS unreadCount
       FROM notifications
      WHERE company_id = ? AND recipient_empid = ? AND is_read = 0 AND deleted_at IS NULL`,
    params,
  );
  const notifications = rows.map((row) => ({
    id: row.notification_id,
    recipientEmpId: row.recipient_empid,
    type: row.type,
    relatedId: row.related_id,
    message: row.message,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    createdBy: row.created_by,
    transactionName: parseTransactionName(row.message),
  }));
  return {
    notifications,
    unreadCount: Number(countRow?.unreadCount) || 0,
  };
}

export async function markNotificationsRead({
  recipientEmpId,
  companyId,
  ids = [],
  markAll = false,
} = {}) {
  if (!recipientEmpId) return { updated: 0 };
  if (!markAll && (!Array.isArray(ids) || ids.length === 0)) {
    return { updated: 0 };
  }
  const params = [companyId ?? null, recipientEmpId];
  let where = 'company_id = ? AND recipient_empid = ?';
  if (!markAll) {
    const placeholders = ids.map(() => '?').join(', ');
    where += ` AND notification_id IN (${placeholders})`;
    params.push(...ids);
  }
  const [result] = await pool.query(
    `UPDATE notifications
        SET is_read = 1
      WHERE ${where}`,
    params,
  );
  return { updated: result?.affectedRows ?? 0 };
}

import { pool } from '../../db/index.js';

function safeJsonParse(message) {
  if (!message || typeof message !== 'string') return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizeNotification(row) {
  const parsed = safeJsonParse(row.message) || {};
  return {
    id: row.notification_id,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    summary: parsed.summary || row.message,
    transactionName: parsed.transactionName || parsed.tableName || 'Transaction',
    tableName: parsed.tableName || null,
    recordId: parsed.recordId || row.related_id,
    role: parsed.role || null,
    referenceTable: parsed.referenceTable || null,
    referenceId: parsed.referenceId || null,
  };
}

export async function listTransactionNotifications({
  empId,
  companyId,
  limit = 50,
  offset = 0,
}) {
  const normalizedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
  const normalizedOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
  const [rows] = await pool.query(
    `SELECT notification_id, message, created_at, is_read, related_id
       FROM notifications
      WHERE recipient_empid = ?
        AND company_id = ?
        AND type = 'transaction'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [empId, companyId, normalizedLimit, normalizedOffset],
  );
  const notifications = rows.map((row) => normalizeNotification(row));
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS unread
       FROM notifications
      WHERE recipient_empid = ?
        AND company_id = ?
        AND type = 'transaction'
        AND is_read = 0`,
    [empId, companyId],
  );
  return { notifications, unreadCount: countRow?.unread ?? 0 };
}

export async function markTransactionNotificationsRead({ empId, companyId, ids = [] }) {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [ids])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (normalizedIds.length === 0) return 0;
  const [result] = await pool.query(
    `UPDATE notifications
        SET is_read = 1
      WHERE notification_id IN (${normalizedIds.map(() => '?').join(', ')})
        AND recipient_empid = ?
        AND company_id = ?
        AND type = 'transaction'`,
    [...normalizedIds, empId, companyId],
  );
  return result?.affectedRows ?? 0;
}

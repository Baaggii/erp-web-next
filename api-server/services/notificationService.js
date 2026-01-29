import { pool } from '../../db/index.js';
import { isDynamicTransactionNotification } from './transactionNotificationService.js';

function parseNotificationMessage(message) {
  if (!message || typeof message !== 'string') return { summary: '', meta: null };
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === 'object') {
      return {
        summary: parsed.summary || message,
        meta: parsed,
      };
    }
  } catch {
    // ignore
  }
  return { summary: message, meta: null };
}

export async function listDynamicTransactionNotifications({
  empId,
  companyId,
  limit = 20,
  offset = 0,
}) {
  if (!empId) return { rows: [] };
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const normalizedOffset = Math.max(Number(offset) || 0, 0);
  try {
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
        WHERE recipient_empid = ?
          AND (company_id = ? OR company_id IS NULL)
          AND message LIKE ?
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      [
        empId,
        companyId ?? null,
        '%"source":"dynamic_transaction"%',
        normalizedLimit,
        normalizedOffset,
      ],
    );
    const normalized = rows
      .filter((row) => isDynamicTransactionNotification(row.message))
      .map((row) => {
        const { summary, meta } = parseNotificationMessage(row.message);
        return {
          id: row.notification_id,
          recipientEmpId: row.recipient_empid,
          relatedId: row.related_id,
          type: row.type,
          isRead: Boolean(row.is_read),
          createdAt: row.created_at,
          createdBy: row.created_by,
          summary,
          source: meta?.source || null,
          transactionName: meta?.transactionName || null,
          tableName: meta?.table || null,
          recordId: meta?.recordId ?? row.related_id,
        };
      });
    return { rows: normalized };
  } catch (err) {
    console.warn('Failed to load notifications', err);
    return { rows: [] };
  }
}

export async function markNotificationsRead({ empId, companyId, ids = [] }) {
  if (!empId) return { updated: 0 };
  const list = Array.isArray(ids)
    ? ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  if (!list.length) return { updated: 0 };
  try {
    const [result] = await pool.query(
      `UPDATE notifications
          SET is_read = 1
        WHERE notification_id IN (?)
          AND recipient_empid = ?
          AND (company_id = ? OR company_id IS NULL)`,
      [list, empId, companyId ?? null],
    );
    return { updated: result?.affectedRows ?? 0 };
  } catch (err) {
    console.warn('Failed to mark notifications read', err);
    return { updated: 0 };
  }
}

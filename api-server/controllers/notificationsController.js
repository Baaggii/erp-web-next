import { pool } from '../../db/index.js';

function parseLimit(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(num, 100);
}

export async function listNotifications(req, res, next) {
  try {
    const empId = String(req.user?.empid || '').trim();
    if (!empId) return res.json({ rows: [], unreadCount: 0 });
    const companyId = Number(req.user?.companyId ?? 0) || 0;
    const limit = parseLimit(req.query.limit, 10);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [rows] = await pool.query(
      `SELECT notification_id, recipient_empid, type, related_id, message, is_read, created_at, created_by\n       FROM notifications\n       WHERE recipient_empid = ? AND company_id = ? AND deleted_at IS NULL\n       ORDER BY created_at DESC\n       LIMIT ? OFFSET ?`,
      [empId, companyId, limit, offset],
    );
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS unreadCount\n       FROM notifications\n       WHERE recipient_empid = ? AND company_id = ? AND deleted_at IS NULL AND is_read = 0`,
      [empId, companyId],
    );
    res.json({ rows: rows || [], unreadCount: Number(countRow?.unreadCount) || 0 });
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ rows: [], unreadCount: 0 });
    }
    next(err);
  }
}

export async function markNotificationsRead(req, res, next) {
  try {
    const empId = String(req.user?.empid || '').trim();
    if (!empId) return res.sendStatus(204);
    const companyId = Number(req.user?.companyId ?? 0) || 0;
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];
    if (ids.length === 0) return res.sendStatus(204);
    const placeholders = ids.map(() => '?').join(', ');
    await pool.query(
      `UPDATE notifications\n       SET is_read = 1\n       WHERE notification_id IN (${placeholders}) AND recipient_empid = ? AND company_id = ?`,
      [...ids, empId, companyId],
    );
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

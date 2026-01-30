import { pool } from '../../db/index.js';

function normalizeLimit(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 30;
  return Math.min(Math.max(value, 1), 100);
}

function parseMessage(raw) {
  if (typeof raw !== 'string') return { text: raw };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return { text: raw };
}

export async function listNotifications(req, res, next) {
  try {
    const limit = normalizeLimit(req.query.limit);
    const unreadOnly =
      req.query.unread === '1' || req.query.unread === 'true';
    const params = [req.user.empid];
    let sql = `
      SELECT notification_id, recipient_empid, type, related_id, message, is_read, created_at
      FROM notifications
      WHERE recipient_empid = ?
        AND deleted_at IS NULL
    `;
    if (req.user.companyId !== undefined && req.user.companyId !== null) {
      sql += ' AND company_id = ?';
      params.push(req.user.companyId);
    }
    if (unreadOnly) {
      sql += ' AND is_read = 0';
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(sql, params);
    const notifications = Array.isArray(rows)
      ? rows.map((row) => ({
          id: row.notification_id,
          recipientEmpId: row.recipient_empid,
          type: row.type,
          relatedId: row.related_id,
          isRead: Boolean(row.is_read),
          createdAt: row.created_at,
          message: parseMessage(row.message),
        }))
      : [];
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationsRead(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];
    const markAll = req.body?.all === true;
    if (!markAll && ids.length === 0) {
      return res.status(400).json({ message: 'Notification ids are required.' });
    }
    const params = [req.user.empid];
    let sql = 'UPDATE notifications SET is_read = 1 WHERE recipient_empid = ?';
    if (req.user.companyId !== undefined && req.user.companyId !== null) {
      sql += ' AND company_id = ?';
      params.push(req.user.companyId);
    }
    if (!markAll) {
      const placeholders = ids.map(() => '?').join(', ');
      sql += ` AND notification_id IN (${placeholders})`;
      params.push(...ids);
    }
    await pool.query(sql, params);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

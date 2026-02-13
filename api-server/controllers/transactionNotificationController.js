import { pool } from '../../db/index.js';
import { queryWithTenantScope } from '../services/tenantScope.js';

export async function listTransactionNotifications(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [rows] = await queryWithTenantScope(
      pool,
      'notifications',
      req.user.companyId,
      `SELECT notification_id, recipient_empid, type, related_id, message, is_read, created_at, updated_at,
              created_by, updated_by
         FROM {{table}}
        WHERE recipient_empid = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      [req.user.empid, limit, offset],
    );
    const [unreadRows] = await queryWithTenantScope(
      pool,
      'notifications',
      req.user.companyId,
      `SELECT COUNT(*) AS unread_count
         FROM {{table}}
        WHERE recipient_empid = ?
          AND is_read = 0
          AND JSON_VALID(message)
          AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(message, '$.kind'))) = 'transaction'`,
      [req.user.empid],
    );
    const seenTransactionIds = new Set();
    const filtered = [];
    for (const row of rows || []) {
      if (!row) continue;
      let payload;
      try {
        payload = row.message ? JSON.parse(row.message) : null;
      } catch {
        payload = null;
      }
      if (payload?.kind === 'transaction' && row.related_id) {
        const key = String(row.related_id);
        if (seenTransactionIds.has(key)) continue;
        seenTransactionIds.add(key);
      }
      filtered.push(row);
    }
    res.json({ rows: filtered, unreadCount: Number(unreadRows?.[0]?.unread_count) || 0 });
  } catch (err) {
    next(err);
  }
}

export async function markTransactionNotificationsRead(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const normalizedIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    if (normalizedIds.length === 0) {
      return res.json({ updated: 0 });
    }
    const [result] = await pool.query(
      `UPDATE notifications
          SET is_read = 1, updated_by = ?, updated_at = NOW()
        WHERE notification_id IN (?)
          AND recipient_empid = ?
          AND company_id = ?`,
      [req.user.empid, normalizedIds, req.user.empid, req.user.companyId],
    );
    res.json({ updated: result?.affectedRows ?? 0 });
  } catch (err) {
    next(err);
  }
}

export async function markAllTransactionNotificationsRead(req, res, next) {
  try {
    const [result] = await pool.query(
      `UPDATE notifications
          SET is_read = 1, updated_by = ?, updated_at = NOW()
        WHERE recipient_empid = ?
          AND company_id = ?
          AND deleted_at IS NULL
          AND is_read = 0
          AND JSON_VALID(message)
          AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(message, '$.kind'))) = 'transaction'`,
      [req.user.empid, req.user.empid, req.user.companyId],
    );
    res.json({ updated: result?.affectedRows ?? 0 });
  } catch (err) {
    next(err);
  }
}

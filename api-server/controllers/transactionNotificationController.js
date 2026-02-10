import { pool } from '../../db/index.js';

const FEED_MAX_LIMIT = 100;

function encodeCursorToken(value) {
  try {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  } catch {
    return null;
  }
}

function decodeCursorToken(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const ts = new Date(parsed.ts).getTime();
    const id = Number(parsed.id);
    if (!Number.isFinite(ts) || !Number.isFinite(id)) return null;
    return { ts: new Date(ts).toISOString(), id };
  } catch {
    return null;
  }
}

export async function listTransactionNotifications(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [rows] = await pool.query(
      `SELECT notification_id, recipient_empid, type, related_id, message, is_read, created_at, updated_at,
              created_by, updated_by
         FROM notifications
        WHERE recipient_empid = ?
          AND company_id = ?
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      [req.user.empid, req.user.companyId, limit, offset],
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
    res.json({ rows: filtered });
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

export async function listUnifiedNotificationsFeed(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), FEED_MAX_LIMIT);
    const cursor = decodeCursorToken(req.query.cursor);
    const userEmpId = String(req.user.empid || '').trim().toUpperCase();
    const companyId = req.user.companyId;
    const perSourceLimit = Math.max(limit * 2, 40);

    const params = [userEmpId, companyId];
    let notificationCursorClause = '';
    if (cursor) {
      notificationCursorClause =
        ' AND (COALESCE(updated_at, created_at) < ? OR (COALESCE(updated_at, created_at) = ? AND notification_id < ?))';
      params.push(cursor.ts, cursor.ts, cursor.id);
    }
    params.push(perSourceLimit);
    const [notificationRows] = await pool.query(
      `SELECT notification_id AS id,
              COALESCE(updated_at, created_at) AS sort_at,
              created_at,
              updated_at,
              message,
              is_read
         FROM notifications
        WHERE UPPER(TRIM(recipient_empid)) = ?
          AND company_id = ?
          AND deleted_at IS NULL
          ${notificationCursorClause}
        ORDER BY COALESCE(updated_at, created_at) DESC, notification_id DESC
        LIMIT ?`,
      params,
    );

    const requestParams = [companyId, userEmpId, userEmpId];
    let requestCursorClause = '';
    if (cursor) {
      requestCursorClause =
        ' AND ((CASE WHEN LOWER(TRIM(status)) = "pending" THEN created_at ELSE COALESCE(responded_at, updated_at, created_at) END) < ? OR ((CASE WHEN LOWER(TRIM(status)) = "pending" THEN created_at ELSE COALESCE(responded_at, updated_at, created_at) END) = ? AND request_id < ?))';
      requestParams.push(cursor.ts, cursor.ts, cursor.id);
    }
    requestParams.push(perSourceLimit);
    const [requestRows] = await pool.query(
      `SELECT request_id AS id,
              request_type,
              status,
              table_name,
              emp_id,
              senior_empid,
              response_empid,
              created_at,
              responded_at,
              CASE
                WHEN LOWER(TRIM(status)) = 'pending' THEN created_at
                ELSE COALESCE(responded_at, updated_at, created_at)
              END AS sort_at
         FROM pending_request
        WHERE company_id = ?
          AND request_type IN ('edit', 'delete', 'report_approval')
          AND (
            UPPER(TRIM(emp_id)) = ?
            OR (
              UPPER(TRIM(senior_empid)) = ?
              AND LOWER(TRIM(status)) = 'pending'
            )
          )
          ${requestCursorClause}
        ORDER BY sort_at DESC, request_id DESC
        LIMIT ?`,
      requestParams,
    );

    const temporaryParams = [companyId, userEmpId, userEmpId];
    let temporaryCursorClause = '';
    if (cursor) {
      temporaryCursorClause =
        ' AND (COALESCE(updated_at, created_at) < ? OR (COALESCE(updated_at, created_at) = ? AND id < ?))';
      temporaryParams.push(cursor.ts, cursor.ts, cursor.id);
    }
    temporaryParams.push(perSourceLimit);
    const [temporaryRows] = await pool.query(
      `SELECT id,
              form_name,
              config_name,
              module_key,
              table_name,
              status,
              created_by,
              plan_senior_empid,
              created_at,
              updated_at,
              COALESCE(updated_at, created_at) AS sort_at
         FROM transaction_temporaries
        WHERE (company_id = ? OR company_id IS NULL)
          AND (
            UPPER(TRIM(created_by)) = ?
            OR (
              status = 'pending'
              AND ((JSON_VALID(plan_senior_empid) AND JSON_CONTAINS(plan_senior_empid, ?, '$')) OR UPPER(TRIM(plan_senior_empid)) = ?)
            )
          )
          ${temporaryCursorClause}
        ORDER BY sort_at DESC, id DESC
        LIMIT ?`,
      [...temporaryParams.slice(0, 3), `"${userEmpId}"`, ...temporaryParams.slice(3)],
    );

    const merged = [];
    (notificationRows || []).forEach((row) => {
      merged.push({
        id: Number(row.id),
        kind: 'transaction',
        sortAt: row.sort_at,
        isUnread: !Boolean(row.is_read),
        payload: row,
      });
    });
    (requestRows || []).forEach((row) => {
      const normalizedStatus = String(row.status || 'pending').trim().toLowerCase();
      const isIncoming =
        normalizedStatus === 'pending' && String(row.senior_empid || '').trim().toUpperCase() === userEmpId;
      const scope = isIncoming ? 'incoming' : normalizedStatus === 'pending' ? 'outgoing' : 'response';
      merged.push({
        id: Number(row.id),
        kind: 'request',
        sortAt: row.sort_at,
        isUnread: normalizedStatus === 'pending',
        payload: {
          ...row,
          status: normalizedStatus,
          tab: isIncoming ? 'incoming' : 'outgoing',
          scope,
        },
      });
    });
    (temporaryRows || []).forEach((row) => {
      const isReview =
        String(row.status || '').trim().toLowerCase() === 'pending' &&
        String(row.created_by || '').trim().toUpperCase() !== userEmpId;
      merged.push({
        id: Number(row.id),
        kind: 'temporary',
        sortAt: row.sort_at,
        isUnread: isReview,
        payload: {
          ...row,
          scope: isReview ? 'review' : 'created',
        },
      });
    });

    const rows = merged
      .filter((row) => Number.isFinite(row.id) && row.sortAt)
      .sort((a, b) => {
        const diff = new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
        if (diff !== 0) return diff;
        return b.id - a.id;
      });

    const pageRows = rows.slice(0, limit);
    const last = pageRows[pageRows.length - 1] || null;
    const hasMore = rows.length > limit;
    res.json({
      rows: pageRows,
      hasMore,
      nextCursor: hasMore && last ? encodeCursorToken({ ts: last.sortAt, id: last.id }) : null,
    });
  } catch (err) {
    next(err);
  }
}

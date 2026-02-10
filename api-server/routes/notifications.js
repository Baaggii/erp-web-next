import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { pool } from '../../db/index.js';

const router = express.Router();

function toTimestamp(value) {
  const ts = new Date(value || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeStatus(value, fallback = 'pending') {
  const normalized = String(value || fallback).trim().toLowerCase();
  return normalized || fallback;
}

function makeRequestPath({ status, requestType, tableName, requestId, createdAt, tab }) {
  const params = new URLSearchParams();
  params.set('tab', tab || 'incoming');
  params.set('status', normalizeStatus(status));
  if (requestType) params.set('requestType', String(requestType));
  if (tableName) params.set('table_name', String(tableName));
  if (requestId != null) params.set('requestId', String(requestId));
  if (createdAt) {
    const date = String(createdAt).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      params.set('date_from', date);
      params.set('date_to', date);
    }
  }
  return `/requests?${params.toString()}`;
}

router.get('/feed', requireAuth, async (req, res, next) => {
  try {
    const chunkLimit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const cursor = Math.max(Number(req.query.cursor) || 0, 0);
    const sourceLimit = Math.min(Math.max(cursor + chunkLimit + 40, 80), 400);
    const userEmpId = String(req.user.empid || '').trim().toUpperCase();
    const companyId = req.user.companyId;

    const [txnRows] = await pool.query(
      `SELECT notification_id, message, is_read, created_at, updated_at
         FROM notifications
        WHERE recipient_empid = ?
          AND company_id = ?
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?`,
      [req.user.empid, companyId, sourceLimit],
    );

    const [incomingRows] = await pool.query(
      `SELECT request_id, request_type, table_name, emp_id, status, created_at, responded_at, response_empid
         FROM pending_request
        WHERE UPPER(TRIM(senior_empid)) = ?
          AND company_id = ?
          AND LOWER(TRIM(status)) = 'pending'
        ORDER BY created_at DESC
        LIMIT ?`,
      [userEmpId, companyId, sourceLimit],
    );

    const [outgoingRows] = await pool.query(
      `SELECT request_id, request_type, table_name, emp_id, status, created_at, responded_at, response_empid
         FROM pending_request
        WHERE UPPER(TRIM(emp_id)) = ?
          AND company_id = ?
          AND LOWER(TRIM(status)) IN ('pending', 'accepted', 'declined')
        ORDER BY COALESCE(responded_at, created_at) DESC
        LIMIT ?`,
      [userEmpId, companyId, sourceLimit],
    );

    const items = [];

    for (const row of txnRows || []) {
      let payload = null;
      try {
        payload = row.message ? JSON.parse(row.message) : null;
      } catch {
        payload = null;
      }
      const title = payload?.transactionName || payload?.transaction_name || 'Transaction';
      items.push({
        id: `transaction-${row.notification_id}`,
        source: 'transaction',
        title,
        preview: payload?.summaryText || 'Transaction update',
        status: payload?.action || 'new',
        timestamp: row.updated_at || row.created_at,
        unread: Number(row.is_read) === 0,
        action: {
          type: 'navigate',
          path: '/?tab=activity',
          notificationId: row.notification_id,
        },
      });
    }

    for (const row of incomingRows || []) {
      const status = normalizeStatus(row.status);
      items.push({
        id: `pending-incoming-${row.request_id}`,
        source: 'pending_request_incoming',
        title: String(row.request_type || 'Request').replace(/_/g, ' '),
        preview: `Requested by ${row.emp_id || 'Unknown'}`,
        status,
        timestamp: row.created_at,
        unread: true,
        action: {
          type: 'navigate',
          path: makeRequestPath({
            tab: 'incoming',
            status,
            requestType: row.request_type,
            tableName: row.table_name,
            requestId: row.request_id,
            createdAt: row.created_at,
          }),
        },
      });
    }

    for (const row of outgoingRows || []) {
      const status = normalizeStatus(row.status);
      const scope = status === 'pending' ? 'outgoing' : 'response';
      const timestamp = scope === 'response' ? row.responded_at || row.created_at : row.created_at;
      items.push({
        id: `pending-outgoing-${row.request_id}-${status}`,
        source: 'pending_request_outgoing',
        title: String(row.request_type || 'Request').replace(/_/g, ' '),
        preview:
          scope === 'response'
            ? `Responded by ${row.response_empid || 'Unknown'}`
            : `Requested by ${row.emp_id || 'Unknown'}`,
        status,
        timestamp,
        unread: status === 'pending',
        action: {
          type: 'navigate',
          path: makeRequestPath({
            tab: 'outgoing',
            status,
            requestType: row.request_type,
            tableName: row.table_name,
            requestId: row.request_id,
            createdAt: row.created_at,
          }),
        },
      });
    }

    items.sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp));

    const pageItems = items.slice(cursor, cursor + chunkLimit);
    const nextCursor = cursor + chunkLimit < items.length ? String(cursor + chunkLimit) : null;

    const unreadCountBySource = pageItems.reduce((acc, item) => {
      if (!item.unread) return acc;
      acc[item.source] = (acc[item.source] || 0) + 1;
      return acc;
    }, {});

    res.json({ items: pageItems, nextCursor, unreadCountBySource });
  } catch (err) {
    next(err);
  }
});

export default router;

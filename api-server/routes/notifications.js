import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.js';
import { pool } from '../../db/index.js';

const router = express.Router();

const feedRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

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
    const parsed = new Date(createdAt);
    const ts = parsed.getTime();
    if (Number.isFinite(ts)) {
      const date = parsed.toISOString().slice(0, 10);
      params.set('date_from', date);
      params.set('date_to', date);
    }
  }
  return `/requests?${params.toString()}`;
}

function makeTransactionPath({ payload, notificationId }) {
  const params = new URLSearchParams();
  params.set('tab', 'activity');
  params.set('notifyGroup', payload?.transactionName || 'Transaction');
  params.set('notifyItem', `transaction-${notificationId}`);
  return `/?${params.toString()}`;
}

function makeTemporaryPath({ temporaryId, temporaryRow, payload, userEmpId }) {
  const params = new URLSearchParams();
  params.set('tab', 'activity');
  params.set('temporaryOpen', '1');
  const creator = String(temporaryRow?.created_by || payload?.createdBy || '').trim().toUpperCase();
  const scope = creator && creator === userEmpId ? 'created' : 'review';
  params.set('temporaryScope', scope);
  params.set('temporaryKey', String(Date.now()));
  const formName = temporaryRow?.form_name || payload?.formName || payload?.form_name;
  if (formName) params.set('temporaryForm', String(formName));
  const configName = temporaryRow?.config_name || payload?.configName || payload?.config_name;
  if (configName) params.set('temporaryConfig', String(configName));
  if (temporaryId != null) params.set('temporaryId', String(temporaryId));
  return `/?${params.toString()}`;
}

function formatTransactionFormName(payload) {
  const name =
    payload?.transactionName ||
    payload?.transaction_name ||
    payload?.formName ||
    payload?.form_name;
  if (name) return String(name).trim();
  return 'Transaction';
}

function formatTransactionAction(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Updated';
  if (normalized === 'create' || normalized === 'created' || normalized === 'new') return 'Created';
  if (normalized === 'update' || normalized === 'updated' || normalized === 'edit' || normalized === 'edited') return 'Edited';
  if (normalized === 'delete' || normalized === 'deleted') return 'Deleted';
  if (normalized === 'exclude' || normalized === 'excluded') return 'Excluded';
  if (normalized === 'include' || normalized === 'included') return 'Included';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildTransactionPreview(payload) {
  const actionLabel = formatTransactionAction(payload?.action);
  const formName = formatTransactionFormName(payload);
  const summary = String(payload?.summaryText || '').trim();
  if (summary) {
    return `${actionLabel} • ${formName} • ${summary}`;
  }
  return `${actionLabel} • ${formName}`;
}

function parseNotificationMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return null;
  try {
    const parsed = JSON.parse(rawMessage);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isTransactionPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const kind = String(payload.kind || '').trim().toLowerCase();
  if (kind === 'transaction') return true;
  if (payload.transactionName || payload.transaction_name) return true;
  if (payload.transactionTable || payload.transaction_table) return true;
  return false;
}

function isTemporaryPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const kind = String(payload.kind || '').trim().toLowerCase();
  return kind === 'temporary' || Boolean(payload.temporarySubmission);
}

function formatTemporaryAction(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Pending review';
  if (normalized === 'pending') return 'Pending review';
  if (normalized === 'promoted' || normalized === 'approved') return 'Approved';
  if (normalized === 'rejected' || normalized === 'declined') return 'Rejected';
  if (normalized === 'forwarded') return 'Forwarded';
  if (normalized === 'created' || normalized === 'create') return 'Created';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function detectTemporaryStatus({ row, payload, temporaryRow }) {
  const candidates = [payload?.action, payload?.status, temporaryRow?.status, row?.status];
  const directMatch = candidates
    .map((value) => String(value || '').trim().toLowerCase())
    .find(Boolean);
  if (directMatch) return directMatch;

  const text = String(row?.message || '').trim().toLowerCase();
  if (text.includes('forwarded')) return 'forwarded';
  if (text.includes('approved') || text.includes('promoted')) return 'promoted';
  if (text.includes('rejected') || text.includes('declined')) return 'rejected';
  return 'pending';
}

function formatTemporaryFormName(temporaryRow, payload) {
  if (temporaryRow) {
    return (
      temporaryRow.form_name ||
      temporaryRow.config_name ||
      formatTableLabel(temporaryRow.table_name) ||
      'Temporary transaction'
    );
  }
  return formatTransactionFormName(payload);
}

function buildTemporaryPreview({ temporaryRow, payload, status, message }) {
  const actionLabel = formatTemporaryAction(status);
  const formName = formatTemporaryFormName(temporaryRow, payload);
  const summary = String(payload?.summaryText || payload?.summary_text || message || '').trim();
  if (summary) return `${actionLabel} • ${formName} • ${summary}`;
  return `${actionLabel} • ${formName}`;
}

router.get('/feed', requireAuth, feedRateLimiter, async (req, res, next) => {
  try {
    const chunkLimit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const cursor = Math.max(Number(req.query.cursor) || 0, 0);
    const sourceLimit = Math.min(Math.max(cursor + chunkLimit + 40, 80), 400);
    const userEmpId = String(req.user.empid || '').trim().toUpperCase();
    const companyId = req.user.companyId;

    const [notificationRows] = await pool.query(
      `SELECT notification_id, type, related_id, message, is_read, created_at, updated_at
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

    const parsedNotificationRows = (notificationRows || []).map((row) => {
      const payload = parseNotificationMessage(row?.message);
      return {
        row,
        payload,
        isTransaction: isTransactionPayload(payload),
        isTemporary: isTemporaryPayload(payload),
      };
    });

    const temporaryIds = Array.from(
      new Set(
        parsedNotificationRows
          .filter((entry) => {
            const relatedId = Number(entry?.row?.related_id);
            if (!Number.isFinite(relatedId) || relatedId <= 0) return false;
            if (entry.isTransaction) return false;
            return true;
          })
          .map((entry) => Number(entry?.row?.related_id)),
      ),
    );

    let temporaryMap = new Map();
    if (temporaryIds.length > 0) {
      try {
        const [temporaryRows] = await pool.query(
          `SELECT id, table_name, form_name, config_name, status, created_by, reviewed_by, updated_at
             FROM transaction_temporaries
            WHERE company_id = ?
              AND id IN (?)`,
          [companyId, temporaryIds],
        );
        temporaryMap = new Map((temporaryRows || []).map((row) => [Number(row.id), row]));
      } catch {
        temporaryMap = new Map();
      }
    }

    const items = [];

    for (const entry of parsedNotificationRows) {
      const row = entry.row;
      const payload = entry.payload;
      const temporaryId = Number(row?.related_id);
      const temporaryRow = Number.isFinite(temporaryId) ? temporaryMap.get(temporaryId) : null;
      const messageText = String(row?.message || '').trim().toLowerCase();
      const isTemporaryNotification =
        entry.isTemporary ||
        (!entry.isTransaction && Boolean(temporaryRow)) ||
        (!entry.isTransaction && messageText.includes('temporary'));

      if (isTemporaryNotification) {
        const status = detectTemporaryStatus({ row, payload, temporaryRow });
        items.push({
          id: `temporary-${row.notification_id}`,
          source: 'temporary',
          title: formatTemporaryFormName(temporaryRow, payload),
          preview: buildTemporaryPreview({ temporaryRow, payload, status, message: row?.message }),
          status,
          timestamp:
            temporaryRow?.updated_at ||
            payload?.updatedAt ||
            payload?.updated_at ||
            row.created_at,
          unread: Number(row.is_read) === 0,
          action: { type: 'none', notificationId: Number(row.notification_id) || null },
        });
        continue;
      }

      const title = formatTransactionFormName(payload);
      items.push({
        id: `transaction-${row.notification_id}`,
        source: 'transaction',
        title,
        preview: buildTransactionPreview(payload),
        status: payload?.action || 'new',
        timestamp: payload?.updatedAt || row.created_at,
        unread: Number(row.is_read) === 0,
        action: { type: 'none', notificationId: Number(row.notification_id) || null },
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

import express from 'express';
import { pool } from '../../db/index.js';
import { listRequests, listRequestsByEmp } from '../services/pendingRequest.js';
import { listTemporarySubmissions } from '../services/transactionTemporaries.js';

const router = express.Router();

function toEpoch(value) {
  const ts = new Date(value || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function encodeCursor(item) {
  if (!item) return null;
  const payload = { t: Number(item.timestamp) || 0, i: String(item.id || '') };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return {
      t: Number(decoded?.t) || 0,
      i: String(decoded?.i || ''),
    };
  } catch {
    return null;
  }
}

function compareDesc(a, b) {
  const at = Number(a?.timestamp) || 0;
  const bt = Number(b?.timestamp) || 0;
  if (bt !== at) return bt - at;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
}

function formatRequestType(value) {
  if (!value) return 'Request';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRequester(req) {
  return req?.emp_name || req?.empid || req?.emp_id || 'Unknown';
}

function getResponder(req) {
  return req?.response_empid || req?.responseEmpid || req?.response_emp_id || req?.responded_by || 'Unknown';
}

function normalizeAction(action) {
  const value = String(action || '').trim().toLowerCase();
  if (value === 'deleted' || value === 'delete') return { label: 'Deleted', accent: '#dc2626' };
  if (value === 'edited' || value === 'edit' || value === 'update') return { label: 'Edited', accent: '#2563eb' };
  if (value === 'changed' || value === 'change') return { label: 'Changed', accent: '#d97706' };
  if (value === 'excluded' || value === 'exclude') return { label: 'Excluded', accent: '#ea580c' };
  if (value === 'included' || value === 'include') return { label: 'Included', accent: '#059669' };
  return { label: 'New', accent: '#059669' };
}

function normalizeRequestStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'accepted') return { label: 'Approved', accent: '#16a34a' };
  if (value === 'declined') return { label: 'Rejected', accent: '#ef4444' };
  return { label: 'Request', accent: '#f59e0b' };
}

function normalizeTemporaryStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (['accepted', 'approved', 'promoted'].includes(value)) return { label: 'Approval', accent: '#16a34a' };
  if (['declined', 'rejected'].includes(value)) return { label: 'Rejection', accent: '#ef4444' };
  return { label: 'Request', accent: '#f59e0b' };
}

function parseTransactionRow(row) {
  let payload = row?.message;
  if (!payload) return null;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.kind !== 'transaction') return null;
  const timestamp = toEpoch(payload.updatedAt || payload.updated_at || row.updated_at || row.created_at);
  const actionMeta = normalizeAction(payload.action);
  return {
    id: `transaction-${row.notification_id}`,
    source: 'transaction',
    title: payload.transactionName || 'Transaction',
    preview: payload.summaryText || payload.summary_text || 'Transaction update',
    status: actionMeta.label,
    badgeAccent: actionMeta.accent,
    timestamp,
    unread: !Boolean(row.is_read),
    action: {
      type: 'transaction',
      transaction: {
        id: row.notification_id,
        transactionName: payload.transactionName || 'Transaction',
        transactionTable: payload.transactionTable,
        action: payload.action,
        summaryText: payload.summaryText || payload.summary_text || '',
        updatedAt: payload.updatedAt || payload.updated_at || row.updated_at,
        createdAt: row.created_at,
        isRead: Boolean(row.is_read),
      },
    },
  };
}

function mapRequestItem(req, source, scope, tab, status) {
  const ts = scope === 'response'
    ? toEpoch(req?.responded_at || req?.respondedAt || req?.response_at || req?.responseAt || req?.updated_at)
    : toEpoch(req?.updated_at || req?.updatedAt || req?.created_at || req?.createdAt);
  const statusMeta = normalizeRequestStatus(status || req?.status);
  return {
    id: `${source}-${req?.request_id}-${scope}-${status || req?.status || 'pending'}`,
    source,
    title: formatRequestType(req?.request_type),
    preview:
      scope === 'response'
        ? `Responded by ${getResponder(req)}`
        : `Requested by ${getRequester(req)}`,
    status: statusMeta.label,
    badgeAccent: statusMeta.accent,
    timestamp: ts,
    unread: String(status || req?.status || '').toLowerCase() === 'pending',
    action: {
      type: 'request',
      tab,
      status: String(status || req?.status || 'pending').toLowerCase(),
      request: req,
    },
  };
}

function mapTemporaryItem(entry, scope) {
  const ts = toEpoch(
    entry?.updated_at ||
      entry?.updatedAt ||
      entry?.created_at ||
      entry?.createdAt ||
      entry?.submitted_at ||
      entry?.submittedAt,
  );
  const statusMeta = normalizeTemporaryStatus(
    entry?.status || entry?.review_status || (scope === 'review' ? 'pending' : ''),
  );
  return {
    id: `temporary-${entry?.id || entry?.temporary_id || entry?.temporaryId}-${scope}`,
    source: 'temporary',
    title:
      entry?.formName ||
      entry?.form_name ||
      entry?.configName ||
      entry?.config_name ||
      entry?.moduleKey ||
      entry?.module_key ||
      'Temporary transaction',
    preview: entry?.creatorName || entry?.creator_name || entry?.created_by || '',
    status: statusMeta.label,
    badgeAccent: statusMeta.accent,
    timestamp: ts,
    unread: scope === 'review',
    action: {
      type: 'temporary',
      scope,
      entry,
    },
  };
}

router.get('/feed', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const sourceFetchLimit = Math.max(limit * 3, 60);
    const cursor = decodeCursor(req.query.cursor);
    const requestStatuses = ['pending', 'accepted', 'declined'];

    const [notificationRows, incomingRows, outgoingRows, tempReview, tempCreated] = await Promise.all([
      pool.query(
        `SELECT notification_id, message, is_read, created_at, updated_at
           FROM notifications
          WHERE recipient_empid = ?
            AND company_id = ?
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ?`,
        [req.user.empid, req.user.companyId, sourceFetchLimit],
      ).then(([rows]) => rows || []),
      listRequests({
        senior_empid: String(req.user.empid || '').trim().toUpperCase(),
        status: 'pending',
        page: 1,
        per_page: sourceFetchLimit,
      }).then((result) => result?.rows || []),
      listRequestsByEmp(req.user.empid, {
        status: requestStatuses.join(','),
        page: 1,
        per_page: sourceFetchLimit,
      }).then((result) => result?.rows || []),
      listTemporarySubmissions({
        scope: 'review',
        empId: req.user.empid,
        companyId: req.user.companyId,
        status: 'pending',
        limit: sourceFetchLimit,
        includeHasMore: false,
      }).then((result) => result?.rows || []),
      listTemporarySubmissions({
        scope: 'created',
        empId: req.user.empid,
        companyId: req.user.companyId,
        status: 'any',
        limit: sourceFetchLimit,
        includeHasMore: false,
      }).then((result) => result?.rows || []),
    ]);

    const transactionItems = notificationRows.map(parseTransactionRow).filter(Boolean);

    const requestItems = [];
    incomingRows.forEach((reqRow) => {
      requestItems.push(mapRequestItem(reqRow, 'workflow', 'incoming', 'incoming', 'pending'));
    });
    outgoingRows.forEach((reqRow) => {
      const normalizedStatus = String(reqRow?.status || reqRow?.response_status || 'pending').toLowerCase();
      const scope = normalizedStatus === 'pending' ? 'outgoing' : 'response';
      requestItems.push(mapRequestItem(reqRow, 'workflow', scope, 'outgoing', normalizedStatus));
    });

    const temporaryItems = [
      ...tempReview.map((entry) => mapTemporaryItem(entry, 'review')),
      ...tempCreated.map((entry) => mapTemporaryItem(entry, 'created')),
    ];

    const all = [...transactionItems, ...requestItems, ...temporaryItems].sort(compareDesc);
    const filtered = cursor
      ? all.filter((item) =>
          Number(item.timestamp) < cursor.t ||
          (Number(item.timestamp) === cursor.t && String(item.id) < cursor.i),
        )
      : all;
    const pageItems = filtered.slice(0, limit);
    const hasMore = filtered.length > pageItems.length;
    const unreadCountBySource = {
      transaction: transactionItems.filter((item) => item.unread).length,
      workflow: requestItems.filter((item) => item.unread).length,
      temporary: temporaryItems.filter((item) => item.unread).length,
    };

    res.json({
      items: pageItems,
      nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null,
      unreadCountBySource,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

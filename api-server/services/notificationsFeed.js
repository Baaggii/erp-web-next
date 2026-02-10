import { pool } from '../../db/index.js';

function parseTransactionPayload(message) {
  if (!message) return null;
  let payload = message;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.kind !== 'transaction') return null;
  return payload;
}

function toMillis(value) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function encodeCursor(item) {
  if (!item) return null;
  return `${item.timestamp}|${item.id}`;
}

function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  const [timestampRaw, idRaw] = cursor.split('|');
  const timestamp = Number(timestampRaw);
  const id = Number(idRaw);
  if (!Number.isFinite(timestamp) || !Number.isFinite(id)) return null;
  return { timestamp, id };
}

function compareFeedItemsDesc(a, b) {
  if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
  return Number(b.id || 0) - Number(a.id || 0);
}

function shouldIncludeByCursor(item, cursor) {
  if (!cursor) return true;
  if (item.timestamp < cursor.timestamp) return true;
  if (item.timestamp > cursor.timestamp) return false;
  return Number(item.id || 0) < cursor.id;
}

export async function getNotificationsFeed({ empId, companyId, limit = 100, cursor } = {}) {
  const normalizedEmpId = String(empId || '').trim().toUpperCase();
  const normalizedCompanyId = Number(companyId) || 0;
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 200);

  if (!normalizedEmpId || normalizedCompanyId <= 0) {
    return {
      items: [],
      nextCursor: null,
      unreadCountBySource: { transaction: 0, incoming: 0, outgoing: 0 },
    };
  }

  const [transactionRows] = await pool.query(
    `SELECT notification_id, message, is_read, created_at, updated_at
       FROM notifications
      WHERE recipient_empid = ?
        AND company_id = ?
        AND deleted_at IS NULL
      ORDER BY COALESCE(updated_at, created_at) DESC, notification_id DESC
      LIMIT 400`,
    [normalizedEmpId, normalizedCompanyId],
  );

  const transactionItems = [];
  let unreadTransaction = 0;
  for (const row of transactionRows || []) {
    const payload = parseTransactionPayload(row.message);
    if (!payload) continue;
    const tsValue = payload.updatedAt || payload.updated_at || row.updated_at || row.created_at;
    const timestamp = toMillis(tsValue);
    const unread = !Boolean(row.is_read);
    if (unread) unreadTransaction += 1;
    transactionItems.push({
      id: Number(row.notification_id),
      source: 'transaction',
      title: payload.transactionName || 'Transaction',
      preview: payload.summaryText || payload.summary_text || 'Transaction update',
      status: payload.action || 'new',
      timestamp,
      unread,
      action: {
        type: 'dashboard',
        tab: 'activity',
        notifyItem: Number(row.notification_id),
        notifyGroup: encodeURIComponent(payload.transactionName || 'Transaction'),
      },
    });
  }

  const [requestRows] = await pool.query(
    `SELECT request_id, request_type, status, emp_id, senior_empid, response_empid,
            created_at, responded_at, updated_at
       FROM pending_request
      WHERE company_id = ?
        AND (
          (UPPER(TRIM(senior_empid)) = ? AND LOWER(TRIM(status)) = 'pending')
          OR UPPER(TRIM(emp_id)) = ?
        )
      ORDER BY COALESCE(responded_at, updated_at, created_at) DESC, request_id DESC
      LIMIT 400`,
    [normalizedCompanyId, normalizedEmpId, normalizedEmpId],
  );

  const requestItems = [];
  let unreadIncoming = 0;
  let unreadOutgoing = 0;
  for (const row of requestRows || []) {
    const status = String(row.status || 'pending').trim().toLowerCase();
    if (!['pending', 'accepted', 'declined'].includes(status)) continue;
    const isIncoming =
      String(row.senior_empid || '').trim().toUpperCase() === normalizedEmpId &&
      status === 'pending';
    const timestamp =
      status === 'pending'
        ? toMillis(row.created_at)
        : toMillis(row.responded_at || row.updated_at || row.created_at);
    const unread = status === 'pending';
    if (isIncoming && unread) unreadIncoming += 1;
    if (!isIncoming && unread) unreadOutgoing += 1;
    requestItems.push({
      id: Number(row.request_id),
      source: isIncoming ? 'incoming' : 'outgoing',
      title: String(row.request_type || 'request').replace(/_/g, ' '),
      preview: isIncoming
        ? `Requested by ${row.emp_id || 'Unknown'}`
        : status === 'pending'
          ? 'Awaiting response'
          : `Responded by ${row.response_empid || 'Unknown'}`,
      status,
      timestamp,
      unread,
      action: {
        type: 'request',
        tab: isIncoming ? 'incoming' : 'outgoing',
        status,
        requestId: Number(row.request_id),
        requestType: row.request_type || '',
      },
    });
  }

  const cursorInfo = decodeCursor(cursor);
  const sorted = transactionItems.concat(requestItems).sort(compareFeedItemsDesc);
  const filtered = sorted.filter((item) => shouldIncludeByCursor(item, cursorInfo));
  const items = filtered.slice(0, pageSize);
  const nextCursor = filtered.length > pageSize ? encodeCursor(items[items.length - 1]) : null;

  return {
    items,
    nextCursor,
    unreadCountBySource: {
      transaction: unreadTransaction,
      incoming: unreadIncoming,
      outgoing: unreadOutgoing,
    },
  };
}

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../utils/apiBase.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

const NOTIFICATION_KIND = 'transaction';

function getNotificationTimestamp(notification) {
  if (!notification) return 0;
  const raw = notification.updatedAt || notification.createdAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function parseNotificationRow(row) {
  if (!row?.message) return null;
  let payload = row.message;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (typeof payload !== 'object' || payload === null) return null;
  if (!payload || payload.kind !== NOTIFICATION_KIND) return null;
  const updatedAt = payload.updatedAt || payload.updated_at || row.updated_at || row.created_at;
  const summaryFieldsRaw =
    payload.summaryFields || payload.summary_fields || payload.summary_fields_list || [];
  const summaryFields = Array.isArray(summaryFieldsRaw) ? summaryFieldsRaw : [];
  return {
    id: row.notification_id,
    transactionName: payload.transactionName || 'Transaction',
    transactionTable: payload.transactionTable,
    transactionId: payload.transactionId,
    action: payload.action,
    referenceTable: payload.referenceTable,
    referenceId: payload.referenceId,
    role: payload.role,
    summaryFields,
    summaryText: payload.summaryText || payload.summary_text || '',
    excluded: Boolean(payload.excluded),
    actor:
      payload.actor ||
      payload.createdBy ||
      payload.updatedBy ||
      row.updated_by ||
      row.created_by ||
      null,
    createdAt: row.created_at,
    updatedAt,
    isRead: Boolean(row.is_read),
  };
}

function parseNotificationPayload(payload) {
  if (!payload?.message) return null;
  let parsed = payload.message;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (parsed.kind !== NOTIFICATION_KIND) return null;
  const updatedAt =
    parsed.updatedAt ||
    parsed.updated_at ||
    payload.updatedAt ||
    payload.updated_at ||
    payload.created_at;
  const summaryFieldsRaw =
    parsed.summaryFields || parsed.summary_fields || parsed.summary_fields_list || [];
  const summaryFields = Array.isArray(summaryFieldsRaw) ? summaryFieldsRaw : [];
  return {
    id: payload.id,
    transactionName: parsed.transactionName || 'Transaction',
    transactionTable: parsed.transactionTable,
    transactionId: parsed.transactionId,
    action: parsed.action,
    referenceTable: parsed.referenceTable,
    referenceId: parsed.referenceId,
    role: parsed.role,
    summaryFields,
    summaryText: parsed.summaryText || parsed.summary_text || '',
    excluded: Boolean(parsed.excluded),
    actor:
      parsed.actor ||
      parsed.createdBy ||
      parsed.updatedBy ||
      payload.sender ||
      null,
    createdAt: payload.created_at,
    updatedAt,
    isRead: Boolean(payload.is_read) || false,
  };
}

function buildGroups(notifications) {
  const groups = new Map();
  notifications.forEach((notification) => {
    if (!notification) return;
    const name = notification.transactionName || 'Transaction';
    const key = name;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name,
        items: [],
        unreadCount: 0,
        latestAt: 0,
      });
    }
    const group = groups.get(key);
    group.items.push(notification);
    if (!notification.isRead) group.unreadCount += 1;
    const updatedTime = getNotificationTimestamp(notification);
    if (updatedTime > group.latestAt) group.latestAt = updatedTime;
  });
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort(
        (a, b) => getNotificationTimestamp(b) - getNotificationTimestamp(a),
      ),
    }))
    .sort((a, b) => b.latestAt - a.latestAt);
}

export default function useTransactionNotifications() {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const refreshTimerRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!user || user === undefined) return;
    try {
      const res = await fetch(`${API_BASE}/transactions/notifications?limit=100`, {
        credentials: 'include',
        skipErrorToast: true,
        skipLoader: true,
      });
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      const parsed = rows.map(parseNotificationRow).filter(Boolean);
      setNotifications(parsed);
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch (err) {
      console.warn('Failed to load transaction notifications', err);
    }
  }, [user]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refresh();
    }, 500);
  }, [refresh]);

  const markRead = useCallback(
    async (ids = []) => {
      const normalizedIds = Array.isArray(ids)
        ? ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
      if (!normalizedIds.length) return;
      let newlyRead = 0;
      setNotifications((prev) =>
        prev.map((item) => {
          if (!normalizedIds.includes(Number(item.id))) return item;
          if (!item.isRead) newlyRead += 1;
          return { ...item, isRead: true };
        }),
      );
      if (newlyRead > 0) {
        setUnreadCount((prev) => Math.max(prev - newlyRead, 0));
      }
      try {
        await fetch(`${API_BASE}/transactions/notifications/mark-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          skipErrorToast: true,
          skipLoader: true,
          body: JSON.stringify({ ids: normalizedIds }),
        });
      } catch (err) {
        console.warn('Failed to mark transaction notifications read', err);
        refresh();
      }
    },
    [refresh],
  );

  const markGroupRead = useCallback(
    async (groupKey) => {
      if (!groupKey) return;
      const ids = notifications
        .filter((notification) => (notification.transactionName || 'Transaction') === groupKey)
        .map((notification) => notification.id);
      await markRead(ids);
    },
    [markRead, notifications],
  );

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    refresh();
    let socket;
    try {
      socket = connectSocket();
      const handleNew = (payload) => {
        const parsed = parseNotificationPayload(payload);
        if (!parsed) {
          scheduleRefresh();
          return;
        }
        let unreadDelta = 1;
        setNotifications((prev) => {
          const existingIndex = prev.findIndex(
            (item) => Number(item.id) === Number(parsed.id),
          );
          if (existingIndex >= 0) {
            const next = [...prev];
            const existing = prev[existingIndex];
            if (!existing.isRead) unreadDelta = 0;
            next[existingIndex] = {
              ...existing,
              ...parsed,
              isRead: false,
            };
            return next;
          }
          return [{ ...parsed, isRead: false }, ...prev];
        });
        if (unreadDelta > 0) {
          setUnreadCount((prev) => prev + unreadDelta);
        }
      };
      const handleConnect = () => setConnected(true);
      const handleDisconnect = () => setConnected(false);
      socket.on('notification:new', handleNew);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('connect_error', handleDisconnect);
      return () => {
        socket.off('notification:new', handleNew);
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('connect_error', handleDisconnect);
        disconnectSocket();
      };
    } catch (err) {
      console.warn('Failed to connect notification socket', err);
    }
    return undefined;
  }, [refresh, scheduleRefresh, user]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  const groups = useMemo(() => buildGroups(notifications), [notifications]);
  const localUnreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const effectiveUnreadCount = Math.max(unreadCount, localUnreadCount);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    try {
      await fetch(`${API_BASE}/transactions/notifications/mark-all-read`, {
        method: 'POST',
        credentials: 'include',
        skipErrorToast: true,
        skipLoader: true,
      });
    } catch (err) {
      console.warn('Failed to mark all transaction notifications read', err);
      refresh();
    }
  }, [refresh]);

  return {
    notifications,
    groups,
    unreadCount: effectiveUnreadCount,
    isConnected: connected,
    refresh,
    markRead,
    markAllRead,
    markGroupRead,
  };
}

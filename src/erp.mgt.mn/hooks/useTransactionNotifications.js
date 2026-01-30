import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../utils/apiBase.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

const NOTIFICATION_KIND = 'transaction';

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
  return {
    id: row.notification_id,
    transactionName: payload.transactionName || 'Transaction',
    transactionTable: payload.transactionTable,
    transactionId: payload.transactionId,
    referenceTable: payload.referenceTable,
    referenceId: payload.referenceId,
    role: payload.role,
    summaryFields: payload.summaryFields || [],
    summaryText: payload.summaryText || '',
    createdAt: row.created_at,
    isRead: Boolean(row.is_read),
  };
}

function buildGroups(notifications) {
  const groups = new Map();
  notifications.forEach((notification) => {
    if (!notification) return;
    const name = notification.transactionName || 'Transaction';
    const key = encodeURIComponent(name);
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
    const createdTime = notification.createdAt ? new Date(notification.createdAt).getTime() : 0;
    if (createdTime > group.latestAt) group.latestAt = createdTime;
  });
  return Array.from(groups.values()).sort((a, b) => b.latestAt - a.latestAt);
}

export default function useTransactionNotifications() {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [connected, setConnected] = useState(false);
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
    } catch (err) {
      console.warn('Failed to load transaction notifications', err);
    }
  }, [user]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refresh();
    }, 0);
  }, [refresh]);

  const markRead = useCallback(
    async (ids = []) => {
      const normalizedIds = Array.isArray(ids)
        ? ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
      if (!normalizedIds.length) return;
      setNotifications((prev) =>
        prev.map((item) =>
          normalizedIds.includes(Number(item.id)) ? { ...item, isRead: true } : item,
        ),
      );
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
      }
    },
    [],
  );

  const markGroupRead = useCallback(
    async (groupKey) => {
      if (!groupKey) return;
      const ids = notifications
        .filter((notification) => encodeURIComponent(notification.transactionName) === groupKey)
        .map((notification) => notification.id);
      await markRead(ids);
    },
    [markRead, notifications],
  );

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      setNotifications([]);
      return;
    }
    refresh();
    let socket;
    try {
      socket = connectSocket();
      const handleNew = () => scheduleRefresh();
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
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  return {
    notifications,
    groups,
    unreadCount,
    isConnected: connected,
    refresh,
    markRead,
    markGroupRead,
  };
}

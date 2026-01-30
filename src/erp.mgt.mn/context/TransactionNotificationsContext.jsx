import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

const defaultValue = {
  notifications: [],
  groups: [],
  unreadCount: 0,
  hasUnread: false,
  loading: false,
  error: '',
  hasMore: false,
  cursor: null,
  refresh: () => Promise.resolve(),
  loadMore: () => Promise.resolve(),
  markRead: () => Promise.resolve(),
};

export const TransactionNotificationsContext = createContext(defaultValue);

function groupNotifications(items) {
  const grouped = new Map();
  items.forEach((item) => {
    const name = item.transactionName || 'Other transaction';
    const existing = grouped.get(name) || {
      name,
      entries: [],
      latestTimestamp: 0,
      unreadCount: 0,
    };
    existing.entries.push(item);
    const ts = new Date(item.createdAt || 0).getTime();
    if (ts > existing.latestTimestamp) existing.latestTimestamp = ts;
    if (!item.isRead) existing.unreadCount += 1;
    grouped.set(name, existing);
  });
  return Array.from(grouped.values()).sort(
    (a, b) => b.latestTimestamp - a.latestTimestamp,
  );
}

export function TransactionNotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications],
  );

  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  const fetchNotifications = useCallback(
    async ({ append = false } = {}) => {
      if (loading) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (append && cursor) params.set('cursor', cursor);
        params.set('limit', '20');
        const res = await fetch(
          `/api/notifications/transactions?${params.toString()}`,
          { credentials: 'include', skipLoader: true },
        );
        if (!res.ok) throw new Error('Failed to load notifications');
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.rows) ? data.rows : [];
        setNotifications((prev) => {
          const next = append ? prev.concat(rows) : rows;
          const deduped = new Map();
          next.forEach((item) => {
            if (!item?.id) return;
            if (!deduped.has(item.id)) deduped.set(item.id, item);
          });
          return Array.from(deduped.values()).sort((a, b) => {
            const aTime = new Date(a.createdAt || 0).getTime();
            const bTime = new Date(b.createdAt || 0).getTime();
            if (aTime === bTime) return (b.id || 0) - (a.id || 0);
            return bTime - aTime;
          });
        });
        setCursor(data.nextCursor || null);
        setHasMore(Boolean(data.nextCursor));
        setError('');
      } catch (err) {
        setError(err.message || 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    },
    [cursor, loading],
  );

  const refresh = useCallback(() => fetchNotifications({ append: false }), [fetchNotifications]);
  const loadMore = useCallback(() => fetchNotifications({ append: true }), [fetchNotifications]);

  const markRead = useCallback(async (notificationId) => {
    if (!notificationId) return false;
    try {
      const res = await fetch(`/api/notifications/transactions/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item,
        ),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let socket;
    const handleNew = (payload) => {
      if (!payload?.notificationId) return;
      setNotifications((prev) => {
        if (prev.some((item) => item.id === payload.notificationId)) return prev;
        const entry = {
          id: payload.notificationId,
          transactionName: payload.transactionName,
          tableName: payload.tableName,
          recordId: payload.recordId,
          action: payload.action,
          summary: payload.summary,
          message: payload.summary,
          isRead: Boolean(payload.isRead),
          createdAt: payload.createdAt,
        };
        return [entry, ...prev];
      });
    };

    socket = connectSocket();
    if (socket) {
      socket.on('notification:new', handleNew);
    }

    return () => {
      if (socket) {
        socket.off('notification:new', handleNew);
      }
      disconnectSocket();
    };
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      groups,
      unreadCount,
      hasUnread: unreadCount > 0,
      loading,
      error,
      hasMore,
      cursor,
      refresh,
      loadMore,
      markRead,
    }),
    [
      notifications,
      groups,
      unreadCount,
      loading,
      error,
      hasMore,
      cursor,
      refresh,
      loadMore,
      markRead,
    ],
  );

  return (
    <TransactionNotificationsContext.Provider value={value}>
      {children}
    </TransactionNotificationsContext.Provider>
  );
}

export function useTransactionNotifications() {
  return React.useContext(TransactionNotificationsContext);
}

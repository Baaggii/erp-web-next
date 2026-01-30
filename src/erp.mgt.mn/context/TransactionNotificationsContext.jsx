import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

const TransactionNotificationsContext = createContext({
  notifications: [],
  unreadCount: 0,
  loading: false,
  hasMore: false,
  refresh: () => Promise.resolve(),
  loadMore: () => Promise.resolve(),
  markRead: () => Promise.resolve(false),
});

const DEFAULT_PAGE_SIZE = 10;

async function fetchNotifications(page = 1, perPage = DEFAULT_PAGE_SIZE) {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
  });
  const res = await fetch(`/api/notifications?${params.toString()}`, {
    credentials: 'include',
    skipLoader: true,
  });
  if (!res.ok) return { rows: [], page: 1, perPage, total: 0 };
  return res.json().catch(() => ({ rows: [], page: 1, perPage, total: 0 }));
}

async function fetchUnreadCount() {
  const res = await fetch('/api/notifications/unread-count', {
    credentials: 'include',
    skipLoader: true,
  });
  if (!res.ok) return 0;
  const data = await res.json().catch(() => ({ count: 0 }));
  return Number(data?.count) || 0;
}

export function TransactionNotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const socketRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        fetchNotifications(1, DEFAULT_PAGE_SIZE),
        fetchUnreadCount(),
      ]);
      const rows = Array.isArray(list?.rows) ? list.rows : [];
      setNotifications(rows);
      setUnreadCount(count);
      setPage(1);
      setHasMore(rows.length === (list?.perPage || DEFAULT_PAGE_SIZE));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setLoading(true);
    try {
      const list = await fetchNotifications(nextPage, DEFAULT_PAGE_SIZE);
      const rows = Array.isArray(list?.rows) ? list.rows : [];
      setNotifications((prev) => prev.concat(rows));
      setPage(nextPage);
      setHasMore(rows.length === (list?.perPage || DEFAULT_PAGE_SIZE));
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, page]);

  const markRead = useCallback(async (notificationId) => {
    if (!notificationId) return false;
    const res = await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;
    setNotifications((prev) => {
      let shouldDecrement = false;
      const next = prev.map((item) => {
        if (item.notification_id === notificationId) {
          if (!item.is_read) shouldDecrement = true;
          return { ...item, is_read: 1 };
        }
        return item;
      });
      if (shouldDecrement) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
      return next;
    });
    return true;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let socket;
    try {
      socket = connectSocket();
      socketRef.current = socket;
      const handleNotification = (payload) => {
        if (!payload) return;
        const normalized = {
          notification_id: payload.notificationId,
          transaction_name: payload.transactionName,
          transaction_table: payload.tableName,
          record_id: payload.recordId,
          action: payload.action,
          message: payload.message,
          is_read: payload.isRead ? 1 : 0,
          created_at: payload.createdAt,
        };
        setNotifications((prev) => {
          if (prev.some((item) => item.notification_id === normalized.notification_id)) {
            return prev;
          }
          return [normalized, ...prev];
        });
        if (!normalized.is_read) {
          setUnreadCount((prev) => prev + 1);
        }
      };
      socket.on('notification:new', handleNotification);
      return () => {
        if (socket) {
          socket.off('notification:new', handleNotification);
          disconnectSocket();
        }
      };
    } catch {
      return undefined;
    }
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      hasMore,
      refresh,
      loadMore,
      markRead,
    }),
    [hasMore, loadMore, loading, markRead, notifications, refresh, unreadCount],
  );

  return (
    <TransactionNotificationsContext.Provider value={value}>
      {children}
    </TransactionNotificationsContext.Provider>
  );
}

export function useTransactionNotifications() {
  return useContext(TransactionNotificationsContext);
}

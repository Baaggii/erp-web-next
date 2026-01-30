import { useCallback, useEffect, useMemo, useState } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

const DEFAULT_LIMIT = 50;
const FALLBACK_POLL_MS = 60_000;

export default function useTransactionNotifications({ limit = DEFAULT_LIMIT } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      const res = await fetch(`/api/notifications?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.notifications)) {
        setNotifications(data.notifications);
      }
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const markRead = useCallback(
    async (ids) => {
      const list = Array.isArray(ids) ? ids : [ids];
      if (list.length === 0) return;
      try {
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: list }),
        });
      } catch {
        // ignore
      } finally {
        fetchNotifications();
      }
    },
    [fetchNotifications],
  );

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    let socket;
    let pollTimer;
    const handleUpdate = () => fetchNotifications();

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(fetchNotifications, FALLBACK_POLL_MS);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    try {
      socket = connectSocket();
      socket.on('notification:new', handleUpdate);
      socket.on('connect', stopPolling);
      socket.on('disconnect', startPolling);
      socket.on('connect_error', startPolling);
    } catch {
      startPolling();
    }

    return () => {
      if (socket) {
        socket.off('notification:new', handleUpdate);
        socket.off('connect', stopPolling);
        socket.off('disconnect', startPolling);
        socket.off('connect_error', startPolling);
      }
      stopPolling();
      disconnectSocket();
    };
  }, [fetchNotifications]);

  const grouped = useMemo(() => {
    const buckets = new Map();
    notifications.forEach((entry) => {
      const transactionName = entry.transactionName || entry.tableName || 'Transaction';
      const tableName = entry.tableName || 'transaction';
      const key = `${transactionName}::${tableName}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          transactionName,
          tableName,
          entries: [],
          latest: 0,
          unread: 0,
        });
      }
      const bucket = buckets.get(key);
      bucket.entries.push(entry);
      const created = new Date(entry.createdAt || entry.created_at || 0).getTime();
      bucket.latest = Math.max(bucket.latest, Number.isFinite(created) ? created : 0);
      if (!entry.isRead) bucket.unread += 1;
    });
    const groups = Array.from(buckets.values());
    groups.sort((a, b) => b.latest - a.latest);
    groups.forEach((group) => {
      group.entries.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.created_at || 0).getTime();
        const timeB = new Date(b.createdAt || b.created_at || 0).getTime();
        return timeB - timeA;
      });
    });
    return groups;
  }, [notifications]);

  return {
    notifications,
    grouped,
    unreadCount,
    loading,
    refresh: fetchNotifications,
    markRead,
  };
}

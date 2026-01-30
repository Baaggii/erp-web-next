import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

const DEFAULT_LIMIT = 30;
const POLL_INTERVAL_MS = 30_000;

function normalizeNotifications(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item) return null;
      return {
        id: item.id,
        isRead: Boolean(item.isRead),
        createdAt: item.createdAt,
        relatedId: item.relatedId,
        message: item.message || {},
      };
    })
    .filter(Boolean);
}

function isDynamicNotification(notification) {
  return notification?.message?.kind === 'dynamic-transaction';
}

export default function useDynamicNotifications({ limit = DEFAULT_LIMIT } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      const res = await fetch(`/api/notifications?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to load notifications');
      }
      const data = await res.json();
      setNotifications(normalizeNotifications(data.notifications));
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const markRead = useCallback(async (ids = []) => {
    const payload = Array.isArray(ids) ? ids : [ids];
    if (payload.length === 0) return;
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: payload }),
      });
      setNotifications((prev) =>
        prev.map((item) =>
          payload.includes(item.id) ? { ...item, isRead: true } : item,
        ),
      );
    } catch (err) {
      console.error('Failed to mark notifications read', err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } catch (err) {
      console.error('Failed to mark notifications read', err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    pollRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    let socket;
    try {
      socket = connectSocket();
      socket.on('notification:new', fetchNotifications);
    } catch (err) {
      console.warn('Unable to connect notification socket', err);
    }
    return () => {
      if (socket) {
        socket.off('notification:new', fetchNotifications);
        disconnectSocket();
      }
    };
  }, [fetchNotifications]);

  const dynamicNotifications = useMemo(
    () => notifications.filter(isDynamicNotification),
    [notifications],
  );

  const unreadCount = useMemo(
    () => dynamicNotifications.filter((item) => !item.isRead).length,
    [dynamicNotifications],
  );

  return {
    notifications: dynamicNotifications,
    unreadCount,
    loading,
    error,
    refresh: fetchNotifications,
    markRead,
    markAllRead,
  };
}

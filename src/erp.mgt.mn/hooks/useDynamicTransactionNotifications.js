import { useCallback, useMemo } from 'react';
import { useSharedPoller } from '../context/PollingContext.jsx';

const DEFAULT_LIMIT = 12;
const DEFAULT_INTERVAL_MS = 30000;

async function fetchNotifications(limit) {
  const params = new URLSearchParams({ limit: String(limit || DEFAULT_LIMIT) });
  const res = await fetch(`/api/notifications?${params.toString()}`, {
    credentials: 'include',
    skipLoader: true,
    skipErrorToast: true,
  });
  if (res.status === 401 || res.status === 403 || res.status === 503) {
    return { rows: [] };
  }
  if (!res.ok) {
    const err = new Error('Failed to load notifications');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export default function useDynamicTransactionNotifications(options = {}) {
  const limit = Number(options.limit) || DEFAULT_LIMIT;
  const intervalMs = Number(options.intervalMs) || DEFAULT_INTERVAL_MS;
  const key = useMemo(() => `dynamic-notifications-${limit}`, [limit]);
  const fetcher = useCallback(() => fetchNotifications(limit), [limit]);

  const poll = useSharedPoller(key, fetcher, {
    intervalMs,
    pauseWhenHidden: true,
  });

  const notifications = Array.isArray(poll.data?.rows) ? poll.data.rows : [];
  const unreadCount = notifications.filter((entry) => !entry.isRead).length;

  const markRead = useCallback(
    async (ids) => {
      const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
      if (!list.length) return null;
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: list }),
      });
      if (!res.ok) {
        const err = new Error('Failed to mark notifications as read');
        err.status = res.status;
        throw err;
      }
      await poll.refresh();
      return res.json();
    },
    [poll],
  );

  return {
    notifications,
    unreadCount,
    hasUnread: unreadCount > 0,
    loading: !poll.data && !poll.error,
    error: poll.error,
    refresh: poll.refresh,
    markRead,
  };
}

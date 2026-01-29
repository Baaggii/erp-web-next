import { useCallback, useMemo } from 'react';
import { API_BASE } from '../utils/apiBase.js';
import { useSharedPoller } from '../context/PollingContext.jsx';
import useGeneralConfig from './useGeneralConfig.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const DEFAULT_LIMIT = 100;

export default function useTransactionNotifications() {
  const cfg = useGeneralConfig();
  const intervalSeconds =
    Number(cfg?.general?.requestPollingIntervalSeconds) ||
    DEFAULT_POLL_INTERVAL_SECONDS;

  const pollKey = useMemo(() => 'transaction-notifications', []);

  const fetchNotifications = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(DEFAULT_LIMIT) });
    const res = await fetch(`${API_BASE}/transaction_notifications?${params.toString()}`, {
      credentials: 'include',
      skipLoader: true,
    });
    if (!res.ok) throw new Error('Failed to load transaction notifications');
    return await res.json().catch(() => ({}));
  }, []);

  const { data, error, lastUpdated, refresh } = useSharedPoller(
    pollKey,
    fetchNotifications,
    {
      intervalMs: intervalSeconds * 1000,
      pauseWhenHidden: true,
      pauseWhenSocketActive: true,
    },
  );

  const notifications = Array.isArray(data?.rows) ? data.rows : [];
  const totalCount = Number(data?.totalCount) || 0;
  const unreadCount = Number(data?.unreadCount) || 0;

  const markAllRead = useCallback(async () => {
    const res = await fetch(`${API_BASE}/transaction_notifications/mark_read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ all: true }),
    });
    if (!res.ok) throw new Error('Failed to mark notifications');
    await refresh();
  }, [refresh]);

  const markRead = useCallback(
    async (ids = []) => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const res = await fetch(`${API_BASE}/transaction_notifications/mark_read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed to mark notifications');
      await refresh();
    },
    [refresh],
  );

  return {
    notifications,
    totalCount,
    unreadCount,
    hasNew: unreadCount > 0,
    loading: !data && !error,
    error,
    lastUpdated,
    refresh,
    markAllRead,
    markRead,
  };
}

import { useCallback, useMemo } from 'react';
import { useSharedPoller } from '../context/PollingContext.jsx';
import useGeneralConfig from './useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;

export default function useTransactionNotificationCounts(empid) {
  const cfg = useGeneralConfig();
  const intervalSeconds =
    Number(cfg?.general?.requestPollingIntervalSeconds) ||
    DEFAULT_POLL_INTERVAL_SECONDS;

  const pollKey = useMemo(
    () => `transaction-notification-summary:${empid || 'anonymous'}`,
    [empid],
  );

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`${API_BASE}/transaction_notifications/summary`, {
      credentials: 'include',
      skipLoader: true,
    });
    if (!res.ok) throw new Error('Failed to load transaction notifications');
    return await res.json().catch(() => ({}));
  }, []);

  const { data, error, lastUpdated, refresh } = useSharedPoller(
    pollKey,
    fetchSummary,
    {
      intervalMs: intervalSeconds * 1000,
      enabled: Boolean(empid),
      pauseWhenHidden: true,
      pauseWhenSocketActive: true,
    },
  );

  const totalCount = Number(data?.totalCount) || 0;
  const unreadCount = Number(data?.unreadCount) || 0;

  return {
    totalCount,
    unreadCount,
    hasNew: unreadCount > 0,
    error,
    lastUpdated,
    refresh,
  };
}

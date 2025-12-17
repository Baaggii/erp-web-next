import { useCallback, useEffect, useMemo, useState } from 'react';
import useGeneralConfig from './useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';
import { useSharedPoller } from '../context/PollingContext.jsx';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const SCOPES = ['created', 'review'];
const TEMPORARY_FILTER_CACHE_KEY = 'temporary-transaction-filter';

function readCachedTemporaryFilter() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TEMPORARY_FILTER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.field && parsed.value !== undefined && parsed.value !== null) {
      return { field: parsed.field, value: parsed.value };
    }
  } catch (err) {
    console.error('Failed to read cached temporary transaction filter', err);
  }
  return null;
}

function createInitialCounts() {
  return {
    created: {
      count: 0,
      pendingCount: 0,
      reviewedCount: 0,
      totalCount: 0,
      latestUpdate: null,
      newCount: 0,
      hasNew: false,
    },
    review: {
      count: 0,
      pendingCount: 0,
      reviewedCount: 0,
      totalCount: 0,
      latestUpdate: null,
      newCount: 0,
      hasNew: false,
    },
  };
}

export default function useTemporaryNotificationCounts(empid) {
  const [counts, setCounts] = useState(() => createInitialCounts());
  const cfg = useGeneralConfig();
  const intervalSeconds =
    Number(
      cfg?.general?.temporaryPollingIntervalSeconds ||
        cfg?.temporaries?.pollingIntervalSeconds ||
        cfg?.general?.requestPollingIntervalSeconds,
    ) || DEFAULT_POLL_INTERVAL_SECONDS;

  const storageBase = useMemo(() => {
    const id = empid != null && empid !== '' ? String(empid).trim() : 'anonymous';
    return id || 'anonymous';
  }, [empid]);

  const storageKey = useCallback(
    (scope, type = 'pending') =>
      `${storageBase}-temporary-${scope}-${type}-seen`,
    [storageBase],
  );

  const legacyStorageKey = useCallback(
    (scope) => `${storageBase}-temporary-${scope}-seen`,
    [storageBase],
  );

  const pollKey = useMemo(
    () => `temporary-summary:${storageBase}`,
    [storageBase],
  );

  const pollerOptions = useMemo(
    () => ({
      intervalMs: intervalSeconds * 1000,
      enabled: true,
      pauseWhenHidden: true,
      pauseWhenSocketActive: true,
    }),
    [intervalSeconds],
  );

  const getSeenValue = useCallback(
    (scope, type, current) => {
      const key = storageKey(scope, type);
      const raw = localStorage.getItem(key);
      if (raw === null) {
        localStorage.setItem(key, String(current));
        if (type === 'pending') {
          const legacyKey = legacyStorageKey(scope);
          localStorage.setItem(legacyKey, String(current));
        }
        return current;
      }
      const value = Number(raw);
      if (Number.isFinite(value)) {
        return value;
      }
      localStorage.setItem(key, String(current));
      return current;
    },
    [legacyStorageKey, storageKey],
  );

  const evaluateCounts = useCallback(
    (data) => {
      const next = createInitialCounts();
      SCOPES.forEach((scope) => {
        const pendingKey = scope === 'review' ? 'reviewPending' : 'createdPending';
        const reviewedKey = scope === 'review' ? 'reviewReviewed' : 'createdReviewed';
        const totalKey = scope === 'review' ? 'reviewTotal' : 'createdTotal';
        const latestKey = scope === 'review' ? 'reviewLatestUpdate' : 'createdLatestUpdate';
        const pendingRaw = Number(data?.[pendingKey]);
        const reviewedRaw = Number(data?.[reviewedKey]);
        const totalRaw = Number(data?.[totalKey]);
        const pendingCount = Number.isFinite(pendingRaw) ? pendingRaw : 0;
        const reviewedCount = Number.isFinite(reviewedRaw) ? reviewedRaw : 0;
        const totalCount = Number.isFinite(totalRaw) ? totalRaw : pendingCount + reviewedCount;
        const pendingSeen = getSeenValue(scope, 'pending', pendingCount);
        const reviewedSeen = getSeenValue(scope, 'reviewed', reviewedCount);
        const pendingDelta = Math.max(0, pendingCount - pendingSeen);
        const reviewedDelta = Math.max(0, reviewedCount - reviewedSeen);
        const newCount = pendingDelta + reviewedDelta;
        next[scope] = {
          count: pendingCount,
          pendingCount,
          reviewedCount,
          totalCount,
          latestUpdate: data?.[latestKey] || null,
          newCount,
          hasNew: newCount > 0,
        };
      });
      setCounts(next);
    },
    [getSeenValue],
  );

  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const cachedFilter = readCachedTemporaryFilter();
      const hasCachedValue =
        cachedFilter?.value !== undefined && cachedFilter?.value !== null && cachedFilter?.value !== '';
      if (cachedFilter?.field && hasCachedValue) {
        params.set('transactionTypeField', cachedFilter.field);
        params.set('transactionTypeValue', cachedFilter.value);
      }
      const res = await fetch(`${API_BASE}/transaction_temporaries/summary${
        params.size > 0 ? `?${params.toString()}` : ''
      }`, {
        credentials: 'include',
        skipLoader: true,
      });
      if (!res.ok) throw new Error('Failed to load summary');
      return await res.json().catch(() => ({}));
    } catch {
      return null;
    }
  }, []);

  const { data: latestSummary, refresh: refreshSummary } = useSharedPoller(
    pollKey,
    fetchSummary,
    pollerOptions,
  );

  useEffect(() => {
    if (latestSummary) {
      evaluateCounts(latestSummary);
    }
  }, [evaluateCounts, latestSummary]);

  const refresh = useCallback(() => refreshSummary(), [refreshSummary]);

  useEffect(() => {
    let socket;
    const handleTemporaryUpdate = () => {
      refreshSummary();
    };

    try {
      socket = connectSocket();
      socket.on('temporaryReviewed', handleTemporaryUpdate);
    } catch {
      // ignore socket errors; polling will continue
    }

    return () => {
      if (socket) {
        socket.off('temporaryReviewed', handleTemporaryUpdate);
        disconnectSocket();
      }
    };
  }, [refreshSummary]);

  const markScopeSeen = useCallback(
    (scope) => {
      if (!SCOPES.includes(scope)) return;
      setCounts((prev) => {
        const current =
          prev[scope] || {
            count: 0,
            pendingCount: 0,
            reviewedCount: 0,
            totalCount: 0,
            latestUpdate: null,
            newCount: 0,
            hasNew: false,
          };
        localStorage.setItem(storageKey(scope, 'pending'), String(current.pendingCount));
        localStorage.setItem(storageKey(scope, 'reviewed'), String(current.reviewedCount));
        localStorage.setItem(legacyStorageKey(scope), String(current.pendingCount));
        return {
          ...prev,
          [scope]: {
            ...current,
            count: current.pendingCount,
            newCount: 0,
            hasNew: false,
          },
        };
      });
    },
    [legacyStorageKey, storageKey],
  );

  const markAllSeen = useCallback(() => {
    SCOPES.forEach((scope) => markScopeSeen(scope));
  }, [markScopeSeen]);

  const fetchScopeEntries = useCallback(async (scope, options = {}) => {
    const { limit = 50, status = 'pending', cursor = 0 } = options || {};
    if (!SCOPES.includes(scope)) return { rows: [], hasMore: false, nextCursor: null };
    const params = new URLSearchParams({ scope });
    if (status && typeof status === 'string') {
      params.set('status', status);
    }
    const normalizedLimit = Number(limit);
    if (Number.isFinite(normalizedLimit) && normalizedLimit > 0) {
      params.set('limit', String(normalizedLimit));
    }
    const normalizedCursor = Number(cursor);
    if (Number.isFinite(normalizedCursor) && normalizedCursor >= 0) {
      params.set('offset', String(normalizedCursor));
    }
    const cachedFilter = readCachedTemporaryFilter();
    const hasCachedValue =
      cachedFilter?.value !== undefined && cachedFilter?.value !== null && cachedFilter?.value !== '';
    if (cachedFilter?.field && hasCachedValue) {
      params.set('transactionTypeField', cachedFilter.field);
      params.set('transactionTypeValue', cachedFilter.value);
    }
    try {
      const res = await fetch(`${API_BASE}/transaction_temporaries?${params.toString()}`, {
        credentials: 'include',
        skipLoader: true,
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      const hasMore = Boolean(data?.hasMore);
      const nextCursor = Number.isFinite(Number(data?.nextOffset)) ? Number(data.nextOffset) : null;
      if (limit && Number.isFinite(limit)) {
        return { rows: rows.slice(0, limit), hasMore, nextCursor };
      }
      return { rows, hasMore, nextCursor };
    } catch {
      return { rows: [], hasMore: false, nextCursor: null };
    }
  }, []);

  const hasNew = useMemo(
    () => SCOPES.some((scope) => counts[scope]?.hasNew),
    [counts],
  );

  return {
    counts,
    hasNew,
    refresh,
    markScopeSeen,
    markAllSeen,
    fetchScopeEntries,
  };
}

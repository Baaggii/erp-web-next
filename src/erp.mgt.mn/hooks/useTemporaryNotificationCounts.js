import { useCallback, useEffect, useMemo, useState } from 'react';
import useGeneralConfig from './useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const SCOPES = ['created', 'review'];

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
  const [activeTable, setActiveTable] = useState(null);
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

  const refresh = useCallback(async (tableOverride) => {
    try {
      const tableName = (tableOverride ?? activeTable) || '';
      const params = new URLSearchParams();
      if (tableName) {
        params.set('table', tableName);
        params.set('table_name', tableName);
      }
      const search = params.toString();
      const url = search
        ? `${API_BASE}/transaction_temporaries/summary?${search}`
        : `${API_BASE}/transaction_temporaries/summary`;
      const res = await fetch(url, {
        credentials: 'include',
        skipLoader: true,
      });
      if (!res.ok) throw new Error('Failed to load summary');
      const data = await res.json().catch(() => ({}));
      evaluateCounts(data);
    } catch {
      // Ignore errors but keep previous counts
    }
  }, [activeTable, evaluateCounts]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await refresh();
    };
    run();

    const handler = (event) => {
      const tableName = event?.detail?.table || event?.detail?.table_name;
      if (typeof tableName === 'string' && tableName.trim()) {
        const normalized = tableName.trim();
        setActiveTable(normalized);
        refresh(normalized);
        return;
      }
      refresh();
    };

    window.addEventListener('transaction-temporary-refresh', handler);
    const timer = setInterval(() => {
      refresh();
    }, intervalSeconds * 1000);

    return () => {
      cancelled = true;
      window.removeEventListener('transaction-temporary-refresh', handler);
      clearInterval(timer);
    };
  }, [intervalSeconds, refresh]);

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

  const fetchScopeEntries = useCallback(async (scope, limit = 5) => {
    if (!SCOPES.includes(scope)) return [];
    const params = new URLSearchParams({ scope });
    if (activeTable) {
      params.set('table', activeTable);
      params.set('table_name', activeTable);
    }
    try {
      const res = await fetch(`${API_BASE}/transaction_temporaries?${params.toString()}`, {
        credentials: 'include',
        skipLoader: true,
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      if (limit && Number.isFinite(limit)) {
        return rows.slice(0, limit);
      }
      return rows;
    } catch {
      return [];
    }
  }, [activeTable]);

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

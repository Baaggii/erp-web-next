import { useCallback, useEffect, useMemo, useState } from 'react';
import useGeneralConfig from './useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const SCOPES = ['created', 'review'];

function createInitialCounts() {
  return {
    created: { count: 0, newCount: 0, hasNew: false },
    review: { count: 0, newCount: 0, hasNew: false },
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
    (scope) => `${storageBase}-temporary-${scope}-seen`,
    [storageBase],
  );

  const evaluateCounts = useCallback(
    (data) => {
      const next = createInitialCounts();
      SCOPES.forEach((scope) => {
        const rawCount = Number(
          scope === 'review' ? data?.reviewPending : data?.createdPending,
        );
        const count = Number.isFinite(rawCount) ? rawCount : 0;
        const key = storageKey(scope);
        const stored = localStorage.getItem(key);
        let seen = stored === null ? count : Number(stored);
        if (!Number.isFinite(seen)) seen = 0;
        if (stored === null) {
          localStorage.setItem(key, String(count));
        }
        const delta = Math.max(0, count - seen);
        next[scope] = { count, newCount: delta, hasNew: delta > 0 };
      });
      setCounts(next);
    },
    [storageKey],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/transaction_temporaries/summary`, {
        credentials: 'include',
        skipLoader: true,
      });
      if (!res.ok) throw new Error('Failed to load summary');
      const data = await res.json().catch(() => ({}));
      evaluateCounts(data);
    } catch {
      // Ignore errors but keep previous counts
    }
  }, [evaluateCounts]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await refresh();
    };
    run();

    const handler = () => {
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
        const current = prev[scope] || { count: 0, newCount: 0, hasNew: false };
        localStorage.setItem(storageKey(scope), String(current.count));
        return {
          ...prev,
          [scope]: { count: current.count, newCount: 0, hasNew: false },
        };
      });
    },
    [storageKey],
  );

  const markAllSeen = useCallback(() => {
    SCOPES.forEach((scope) => markScopeSeen(scope));
  }, [markScopeSeen]);

  const fetchScopeEntries = useCallback(async (scope, limit = 5) => {
    if (!SCOPES.includes(scope)) return [];
    const params = new URLSearchParams({ scope });
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

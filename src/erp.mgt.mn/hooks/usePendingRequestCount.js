import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useSharedPoller } from '../context/PollingContext.jsx';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const DISCONNECT_FALLBACK_MS = 30 * 1000;

/**
 * Polls the pending request endpoint for a supervisor and returns the count.
 * @param {string|number} seniorEmpId Employee ID of the supervisor
 * @param {object} [filters] Optional filters (requested_empid, table_name, date_from, date_to)
 * @param {string|number} empid Current user's employee ID
 * @returns {{count:number, hasNew:boolean, markSeen:()=>void}}
 */
export default function usePendingRequestCount(
  seniorEmpId,
  filters,
  empid,
  seniorPlanEmpId,
) {
  const storageKey = useMemo(() => `${empid}-pendingSeen`, [empid]);
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const [seen, setSeen] = useState(() =>
    Number(localStorage.getItem(storageKey) || 0),
  );
  const [hasNew, setHasNew] = useState(false);
  const cfg = useGeneralConfig();
  const pollingEnabled = !!cfg?.general?.requestPollingEnabled;
  const intervalSeconds =
    Number(cfg?.general?.requestPollingIntervalSeconds) ||
    DEFAULT_POLL_INTERVAL_SECONDS;

  const markSeen = () => {
    localStorage.setItem(storageKey, String(count));
    setSeen(count);
    setHasNew(false);
    window.dispatchEvent(new Event('pending-request-seen'));
  };

  const memoFilters = useMemo(() => filters || {}, [filters]);
  const effectiveSeniorEmpId = useMemo(() => {
    const type = memoFilters.request_type ?? memoFilters.requestType;
    if (type === 'report_approval' && seniorPlanEmpId) {
      return seniorPlanEmpId;
    }
    return seniorEmpId;
  }, [memoFilters, seniorEmpId, seniorPlanEmpId]);

  const [enablePolling, setEnablePolling] = useState(false);
  const disconnectTimeoutRef = useRef();
  const filterKey = useMemo(() => JSON.stringify(memoFilters), [memoFilters]);
  const pollKey = useMemo(
    () => `pending-request:${effectiveSeniorEmpId ?? 'none'}:${filterKey}`,
    [effectiveSeniorEmpId, filterKey],
  );

  const applyCount = useCallback(
    (value) => {
      const normalized = Number(value) || 0;
      countRef.current = normalized;
      setCount(normalized);
      const storedSeen = Number(localStorage.getItem(storageKey) || 0);
      const newHasNew = normalized > storedSeen;
      setHasNew(newHasNew);
      if (newHasNew) window.dispatchEvent(new Event('pending-request-new'));
    },
    [storageKey],
  );

  const fetchCount = useCallback(async () => {
    if (!effectiveSeniorEmpId) return 0;

    const params = new URLSearchParams({
      status: 'pending',
      senior_empid: String(effectiveSeniorEmpId),
    });
    Object.entries(memoFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, v);
      }
    });

    try {
      const res = await fetch(`/api/pending_request?${params.toString()}`, {
        credentials: 'include',
        skipLoader: true,
      });
      if (!res.ok) return 0;
      const data = await res.json().catch(() => 0);
      if (typeof data === 'number') return data;
      if (Array.isArray(data)) return data.length;
      return Number(data?.count) || 0;
    } catch {
      return 0;
    }
  }, [effectiveSeniorEmpId, memoFilters]);

  const pollerOptions = useMemo(
    () => ({
      intervalMs: intervalSeconds * 1000,
      enabled: pollingEnabled && enablePolling && Boolean(effectiveSeniorEmpId),
      pauseWhenHidden: true,
      pauseWhenSocketActive: true,
    }),
    [effectiveSeniorEmpId, enablePolling, intervalSeconds, pollingEnabled],
  );

  const { data: polledCount } = useSharedPoller(pollKey, fetchCount, pollerOptions);

  useEffect(() => {
    if (polledCount !== undefined && polledCount !== null) {
      applyCount(polledCount);
    }
  }, [applyCount, polledCount]);

  useEffect(() => {
    if (!effectiveSeniorEmpId) {
      setCount(0);
      setHasNew(false);
      setEnablePolling(false);
      return () => {};
    }

    let cancelled = false;
    let socket;

    setEnablePolling(pollingEnabled);

    const applyFromFetch = async () => {
      const value = await fetchCount();
      if (!cancelled) applyCount(value);
    };

    const startFallback = () => {
      if (!pollingEnabled) return;
      if (disconnectTimeoutRef.current) return;
      disconnectTimeoutRef.current = setTimeout(() => {
        setEnablePolling(true);
        disconnectTimeoutRef.current = null;
      }, DISCONNECT_FALLBACK_MS);
    };

    const stopFallback = () => {
      if (disconnectTimeoutRef.current) {
        clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = null;
      }
      setEnablePolling(false);
    };

    applyFromFetch();

    try {
      socket = connectSocket();
      socket.on('newRequest', applyFromFetch);
      socket.on('connect', () => {
        stopFallback();
        applyFromFetch();
      });
      if (pollingEnabled) {
        socket.on('disconnect', startFallback);
        socket.on('connect_error', startFallback);
      }
    } catch {
      if (pollingEnabled) setEnablePolling(true);
    }

    function handleSeen() {
      const s = Number(localStorage.getItem(storageKey) || 0);
      setSeen(s);
      setHasNew(countRef.current > s);
    }

    function handleNew() {
      setHasNew(true);
    }

    window.addEventListener('pending-request-refresh', applyFromFetch);
    window.addEventListener('pending-request-seen', handleSeen);
    window.addEventListener('pending-request-new', handleNew);

    return () => {
      cancelled = true;
      if (disconnectTimeoutRef.current) {
        clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = null;
      }
      if (socket) {
        socket.off('newRequest', applyFromFetch);
        socket.off('connect', stopFallback);
        if (pollingEnabled) {
          socket.off('disconnect', startFallback);
          socket.off('connect_error', startFallback);
        }
        disconnectSocket();
      }
      window.removeEventListener('pending-request-refresh', applyFromFetch);
      window.removeEventListener('pending-request-seen', handleSeen);
      window.removeEventListener('pending-request-new', handleNew);
    };
  }, [
    applyCount,
    effectiveSeniorEmpId,
    fetchCount,
    pollingEnabled,
    storageKey,
  ]);

  return { count, hasNew, markSeen };
}

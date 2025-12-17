import { useEffect, useMemo, useState } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const MIN_POLL_INTERVAL_SECONDS = 120;
const FALLBACK_DISCONNECT_SECONDS = 300;

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
  const [seen, setSeen] = useState(() =>
    Number(localStorage.getItem(storageKey) || 0),
  );
  const [hasNew, setHasNew] = useState(false);
  const cfg = useGeneralConfig();
  const pollingEnabled = !!cfg?.general?.requestPollingEnabled;
  const intervalSeconds = Math.max(
    Number(cfg?.general?.requestPollingIntervalSeconds) || DEFAULT_POLL_INTERVAL_SECONDS,
    MIN_POLL_INTERVAL_SECONDS,
  );

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

  useEffect(() => {
    if (!effectiveSeniorEmpId) {
      setCount(0);
      return undefined;
    }

    const params = new URLSearchParams({
      status: 'pending',
      senior_empid: String(effectiveSeniorEmpId),
    });
    Object.entries(memoFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, v);
      }
    });

    let cancelled = false;
    const inFlight = { current: false };
    async function fetchCount() {
      if (inFlight.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight.current = true;
      try {
        const res = await fetch(`/api/pending_request?${params.toString()}`, {
          credentials: 'include',
          skipLoader: true,
        });
        if (!res.ok) {
          if (!cancelled) setCount(0);
          return;
        }
        const data = await res.json().catch(() => 0);
        let c = 0;
        if (typeof data === 'number') c = data;
        else if (Array.isArray(data)) c = data.length;
        else c = Number(data?.count) || 0;
        if (!cancelled) {
          setCount(c);
          const storedSeen = Number(localStorage.getItem(storageKey) || 0);
          const newHasNew = c > storedSeen;
          setHasNew(newHasNew);
          if (newHasNew) window.dispatchEvent(new Event('pending-request-new'));
        }
      } catch {
        if (!cancelled) {
          setCount(0);
          setHasNew(false);
        }
      } finally {
        inFlight.current = false;
      }
    }

    fetchCount();
    let timer;

    function startPolling(delayMs = intervalSeconds * 1000) {
      if (timer) return;
      timer = setTimeout(function tick() {
        fetchCount();
        timer = setTimeout(tick, intervalSeconds * 1000);
      }, delayMs);
    }

    function stopPolling() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    let fallbackTimer;

    const startFallbackPolling = (delayMs = FALLBACK_DISCONNECT_SECONDS * 1000) => {
      if (fallbackTimer || timer) return;
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        startPolling();
      }, delayMs);
    };

    const clearFallbackPolling = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    let socket;
    try {
      socket = connectSocket();
      socket.on('newRequest', fetchCount);
      if (pollingEnabled) {
        socket.on('connect_error', () => startFallbackPolling());
        socket.on('disconnect', () => startFallbackPolling());
        socket.on('connect', () => {
          stopPolling();
          clearFallbackPolling();
          fetchCount();
        });
      }
    } catch {
      if (pollingEnabled) startFallbackPolling();
    }
    function handleSeen() {
      const s = Number(localStorage.getItem(storageKey) || 0);
      setSeen(s);
      setHasNew(count > s);
    }
    function handleNew() {
      setHasNew(true);
    }
    function handleVisibility() {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
        clearFallbackPolling();
        return;
      }
      fetchCount();
      if (pollingEnabled && (!socket || !socket.connected)) {
        startFallbackPolling();
      }
    }
    window.addEventListener('pending-request-refresh', fetchCount);
    window.addEventListener('pending-request-seen', handleSeen);
    window.addEventListener('pending-request-new', handleNew);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    return () => {
      cancelled = true;
      if (socket) {
        socket.off('newRequest', fetchCount);
        if (pollingEnabled) {
          socket.off('connect_error', startFallbackPolling);
          socket.off('disconnect', startFallbackPolling);
          socket.off('connect', clearFallbackPolling);
        }
        disconnectSocket();
      }
      stopPolling();
      clearFallbackPolling();
      window.removeEventListener('pending-request-refresh', fetchCount);
      window.removeEventListener('pending-request-seen', handleSeen);
      window.removeEventListener('pending-request-new', handleNew);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [
    effectiveSeniorEmpId,
    memoFilters,
    pollingEnabled,
    intervalSeconds,
    storageKey,
  ]);

  return { count, hasNew, markSeen };
}


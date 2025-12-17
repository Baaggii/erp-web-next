import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const MIN_POLL_INTERVAL_SECONDS = 120;

const TemporarySummaryContext = createContext({
  summary: null,
  refresh: () => Promise.resolve(),
  setParams: () => {},
});

function isVisible() {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function TemporarySummaryProvider({ children }) {
  const cfg = useGeneralConfig();
  const [summary, setSummary] = useState(null);
  const [params, setParamsState] = useState({});

  const intervalSeconds = useMemo(
    () =>
      Math.max(
        Number(
          cfg?.general?.temporaryPollingIntervalSeconds ||
            cfg?.temporaries?.pollingIntervalSeconds ||
            cfg?.general?.requestPollingIntervalSeconds,
        ) || DEFAULT_POLL_INTERVAL_SECONDS,
        MIN_POLL_INTERVAL_SECONDS,
      ),
    [cfg?.general?.requestPollingIntervalSeconds, cfg?.general?.temporaryPollingIntervalSeconds, cfg?.temporaries?.pollingIntervalSeconds],
  );

  const normalizedParams = useMemo(() => {
    const normalized = {};
    if (params.table) normalized.table = params.table;
    if (params.transactionTypeField) normalized.transactionTypeField = params.transactionTypeField;
    if (params.transactionTypeValue) normalized.transactionTypeValue = params.transactionTypeValue;
    return normalized;
  }, [params]);

  const inFlight = useRef(false);
  const queued = useRef(false);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!isVisible()) {
      queued.current = true;
      return;
    }
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const query = new URLSearchParams();
      if (normalizedParams.table) {
        query.set('table', normalizedParams.table);
      }
      if (normalizedParams.transactionTypeField && normalizedParams.transactionTypeValue) {
        query.set('transactionTypeField', normalizedParams.transactionTypeField);
        query.set('transactionTypeValue', normalizedParams.transactionTypeValue);
      }
      const res = await fetch(
        `${API_BASE}/transaction_temporaries/summary${
          query.size > 0 ? `?${query.toString()}` : ''
        }`,
        {
          credentials: 'include',
          skipLoader: true,
        },
      );
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data) setSummary(data);
    } catch {
      // ignore errors to avoid disrupting consumers
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        refresh();
      }
    }
  }, [normalizedParams]);

  const schedule = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isVisible()) return;
    timerRef.current = setTimeout(async () => {
      await refresh();
      schedule();
    }, intervalSeconds * 1000);
  }, [intervalSeconds, refresh]);

  useEffect(() => {
    refresh();
    schedule();

    const handleVisibility = () => {
      if (!isVisible()) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      refresh();
      schedule();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [refresh, schedule]);

  const setParams = useCallback((next) => {
    setParamsState((prev) => {
      const updated = typeof next === 'function' ? next(prev) : { ...prev, ...next };
      return updated;
    });
  }, []);

  const value = useMemo(
    () => ({
      summary,
      refresh,
      setParams,
    }),
    [refresh, setParams, summary],
  );

  return (
    <TemporarySummaryContext.Provider value={value}>{children}</TemporarySummaryContext.Provider>
  );
}

export function useTemporarySummary() {
  return useContext(TemporarySummaryContext);
}


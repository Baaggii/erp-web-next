import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onSocketStatusChange } from '../utils/socket.js';

const DEFAULT_RESULT = { data: null, error: null, lastUpdated: null };

const PollingContext = createContext({
  subscribe: () => () => {},
  refreshPoll: () => Promise.resolve(),
  results: new Map(),
  socketConnected: false,
});

function normalizeOptions(options = {}) {
  return {
    enabled: options.enabled !== false,
    intervalMs: Number(options.intervalMs) || 0,
    pauseWhenHidden: options.pauseWhenHidden !== false,
    pauseWhenSocketActive: !!options.pauseWhenSocketActive,
  };
}

export function PollingProvider({ children }) {
  const pollsRef = useRef(new Map());
  const [results, setResults] = useState(() => new Map());
  const [socketConnected, setSocketConnected] = useState(false);
  const [isVisible, setIsVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );

  const updateResult = useCallback((key, next) => {
    setResults((prev) => {
      const current = prev.get(key) || DEFAULT_RESULT;
      const resolved = typeof next === 'function' ? next(current) : next;
      const nextMap = new Map(prev);
      nextMap.set(key, resolved);
      return nextMap;
    });
  }, []);

  const stopTimer = useCallback((entry) => {
    if (entry?.timer) {
      clearInterval(entry.timer);
      entry.timer = null;
    }
  }, []);

  const runPoll = useCallback(async (key, entry) => {
    if (!entry || entry.inFlight) {
      if (entry) entry.pending = true;
      return;
    }
    entry.inFlight = true;
    try {
      const data = await entry.fetcher();
      updateResult(key, { data, error: null, lastUpdated: Date.now() });
    } catch (err) {
      updateResult(key, (prev) => ({ ...prev, error: err }));
    } finally {
      entry.inFlight = false;
      if (entry.pending) {
        entry.pending = false;
        runPoll(key, entry);
      }
    }
  }, [updateResult]);

  const evaluateTimer = useCallback(
    (key, entry) => {
      const { options } = entry;
      if (!options.enabled) {
        stopTimer(entry);
        return;
      }
      if (options.pauseWhenHidden && !isVisible) {
        stopTimer(entry);
        return;
      }
      if (options.pauseWhenSocketActive && socketConnected) {
        stopTimer(entry);
        return;
      }
      if (options.intervalMs <= 0) {
        stopTimer(entry);
        return;
      }
      if (!entry.timer) {
        entry.timer = setInterval(() => runPoll(key, entry), options.intervalMs);
      }
    },
    [isVisible, runPoll, socketConnected, stopTimer],
  );

  const subscribe = useCallback(
    (key, fetcher, rawOptions = {}) => {
      const options = normalizeOptions(rawOptions);
      let entry = pollsRef.current.get(key);
      if (!entry) {
        entry = {
          fetcher,
          options,
          subscribers: 0,
          timer: null,
          inFlight: false,
          pending: false,
        };
        pollsRef.current.set(key, entry);
      } else {
        entry.fetcher = fetcher;
        entry.options = options;
      }
      entry.subscribers += 1;

      runPoll(key, entry);
      evaluateTimer(key, entry);

      return () => {
        const current = pollsRef.current.get(key);
        if (!current) return;
        current.subscribers -= 1;
        if (current.subscribers <= 0) {
          stopTimer(current);
          pollsRef.current.delete(key);
        }
      };
    },
    [evaluateTimer, runPoll, stopTimer],
  );

  const refreshPoll = useCallback(
    async (key) => {
      const entry = pollsRef.current.get(key);
      if (!entry) return null;
      await runPoll(key, entry);
      evaluateTimer(key, entry);
      return results.get(key)?.data ?? null;
    },
    [evaluateTimer, results, runPoll],
  );

  useEffect(() => {
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    pollsRef.current.forEach((entry, key) => evaluateTimer(key, entry));
  }, [evaluateTimer]);

  useEffect(() => {
    const stopListening = onSocketStatusChange((connected) => {
      setSocketConnected(Boolean(connected));
    });
    return () => {
      if (typeof stopListening === 'function') stopListening();
    };
  }, []);

  const value = useMemo(
    () => ({ subscribe, refreshPoll, results, socketConnected }),
    [refreshPoll, results, socketConnected, subscribe],
  );

  return <PollingContext.Provider value={value}>{children}</PollingContext.Provider>;
}

export function useSharedPoller(key, fetcher, options) {
  const { subscribe, refreshPoll, results } = useContext(PollingContext);

  useEffect(() => {
    if (!key || typeof fetcher !== 'function') return undefined;
    const unsubscribe = subscribe(key, fetcher, options);
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [fetcher, key, options, subscribe]);

  const refresh = useCallback(() => refreshPoll(key), [key, refreshPoll]);
  return {
    ...(results.get(key) || DEFAULT_RESULT),
    refresh,
  };
}

export function usePollingContext() {
  return useContext(PollingContext);
}

export default PollingContext;

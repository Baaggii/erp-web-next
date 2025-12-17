import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const MIN_POLL_INTERVAL_SECONDS = 120;
const HIDDEN_POLL_INTERVAL_SECONDS = 300;
const STATUSES = ['pending', 'accepted', 'declined'];

function normalizeStatuses(statuses) {
  if (!statuses) return STATUSES;
  if (Array.isArray(statuses)) {
    const normalized = statuses
      .map((status) => String(status || '').toLowerCase())
      .filter((status) => STATUSES.includes(status));
    return normalized.length > 0 ? normalized : STATUSES;
  }
  const status = String(statuses || '').toLowerCase();
  return STATUSES.includes(status) ? [status] : STATUSES;
}

function stringifyFilters(filters) {
  if (!filters) return '';
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value
          .filter((v) => v !== undefined && v !== null && v !== '')
          .map((v) => [key, String(v)]);
      }
      return [[key, String(value)]];
    })
    .map(([key, value]) => `${key}:${value}`);
  if (!entries.length) return '';
  return entries.sort().join('|');
}

function createInitial() {
  return {
    pending: { count: 0, hasNew: false, newCount: 0 },
    accepted: { count: 0, hasNew: false, newCount: 0 },
    declined: { count: 0, hasNew: false, newCount: 0 },
  };
}

export default function useRequestNotificationCounts(
  seniorEmpId,
  filters,
  empid,
  seniorPlanEmpId,
  options = {},
) {
  const [incoming, setIncoming] = useState(createInitial);
  const [outgoing, setOutgoing] = useState(createInitial);
  const fetchCountsRef = useRef(() => Promise.resolve());
  const cfg = useGeneralConfig();
  const pollingEnabled = !!cfg?.general?.requestPollingEnabled;
  const intervalSeconds = Math.max(
    Number(cfg?.general?.requestPollingIntervalSeconds) || DEFAULT_POLL_INTERVAL_SECONDS,
    MIN_POLL_INTERVAL_SECONDS,
  );

  const filterKey = useMemo(() => stringifyFilters(filters), [filters]);
  const optionNamespace = options ? options.storageNamespace : undefined;
  const storageNamespace = useMemo(() => {
    if (optionNamespace !== undefined && optionNamespace !== null && optionNamespace !== '') {
      return String(optionNamespace);
    }
    return filterKey;
  }, [filterKey, optionNamespace]);
  const storageBase = useMemo(() => {
    const id = empid != null && empid !== '' ? String(empid).trim() : 'anonymous';
    return id || 'anonymous';
  }, [empid]);

  const storageKey = useCallback(
    (type, status) => {
      const suffix = storageNamespace ? `-${storageNamespace}` : '';
      return `${storageBase}-${type}-${status}-seen${suffix}`;
    },
    [storageBase, storageNamespace],
  );

  const markStatusesAsSeen = useCallback(
    (type, statuses) => {
      const list = normalizeStatuses(statuses);
      if (type === 'incoming') {
        setIncoming((prev) => {
          const next = { ...prev };
          list.forEach((status) => {
            const current = prev[status] || { count: 0, hasNew: false, newCount: 0 };
            localStorage.setItem(storageKey('incoming', status), String(current.count));
            next[status] = { ...current, hasNew: false, newCount: 0 };
          });
          return next;
        });
      } else if (type === 'outgoing') {
        setOutgoing((prev) => {
          const next = { ...prev };
          list.forEach((status) => {
            const current = prev[status] || { count: 0, hasNew: false, newCount: 0 };
            localStorage.setItem(storageKey('outgoing', status), String(current.count));
            next[status] = { ...current, hasNew: false, newCount: 0 };
          });
          return next;
        });
      }
    },
    [storageKey],
  );

  const markSeen = useCallback(() => {
    markStatusesAsSeen('incoming');
    markStatusesAsSeen('outgoing');
  }, [markStatusesAsSeen]);

  const markIncoming = useCallback(
    (statuses) => {
      markStatusesAsSeen('incoming', statuses);
    },
    [markStatusesAsSeen],
  );

  const markOutgoing = useCallback(
    (statuses) => {
      markStatusesAsSeen('outgoing', statuses);
    },
    [markStatusesAsSeen],
  );

  const memoFilters = useMemo(() => (filters ? { ...filters } : {}), [filterKey]);
  const supervisorIds = useMemo(() => {
    const ids = [];
    if (seniorEmpId) ids.push(String(seniorEmpId).trim());
    if (seniorPlanEmpId) ids.push(String(seniorPlanEmpId).trim());
    return Array.from(new Set(ids.filter(Boolean)));
  }, [seniorEmpId, seniorPlanEmpId]);

  useEffect(() => {
    let cancelled = false;

    const inFlight = { current: false };
    async function fetchCounts() {
      if (inFlight.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight.current = true;
      const newIncoming = createInitial();
      const newOutgoing = createInitial();

      try {
        await Promise.all(
          STATUSES.map(async (status) => {
            // Incoming requests (for seniors)
            if (supervisorIds.length) {
              try {
                let combined = 0;
                await Promise.all(
                  supervisorIds.map(async (id) => {
                    const params = new URLSearchParams({
                      status,
                      senior_empid: id,
                      count_only: '1',
                    });
                    Object.entries(memoFilters).forEach(([k, v]) => {
                      if (Array.isArray(v)) {
                        v
                          .filter((value) => value !== undefined && value !== null && value !== '')
                          .forEach((value) => params.append(k, value));
                      } else if (v !== undefined && v !== null && v !== '') {
                        params.append(k, v);
                      }
                    });
                    const res = await fetch(
                      `/api/pending_request?${params.toString()}`,
                      { credentials: 'include', skipLoader: true },
                    );
                    if (res.ok) {
                      const data = await res.json().catch(() => 0);
                      if (typeof data === 'number') combined += data;
                      else if (Array.isArray(data)) combined += data.length;
                      else combined += Number(data?.count ?? data?.total) || 0;
                    }
                  }),
                );
                const seenKey = storageKey('incoming', status);
                if (combined === 0) {
                  localStorage.setItem(seenKey, '0');
                  newIncoming[status] = { count: 0, hasNew: false, newCount: 0 };
                } else {
                  const storedSeen = localStorage.getItem(seenKey);
                  const seen = storedSeen === null ? combined : Number(storedSeen);
                  if (storedSeen === null) {
                    localStorage.setItem(seenKey, String(combined));
                  }
                  const delta = Math.max(0, combined - seen);
                  newIncoming[status] = {
                    count: combined,
                    hasNew: delta > 0,
                    newCount: delta,
                  };
                }
              } catch {
                newIncoming[status] = { count: 0, hasNew: false, newCount: 0 };
              }
            } else {
              newIncoming[status] = { count: 0, hasNew: false, newCount: 0 };
            }

            // Outgoing requests (always for current user)
            try {
              const params = new URLSearchParams({ status });
              params.append('count_only', '1');
              Object.entries(memoFilters).forEach(([k, v]) => {
                if (Array.isArray(v)) {
                  v
                    .filter((value) => value !== undefined && value !== null && value !== '')
                    .forEach((value) => params.append(k, value));
                } else if (v !== undefined && v !== null && v !== '') {
                  params.append(k, v);
                }
              });
              const res = await fetch(`/api/pending_request/outgoing?${params.toString()}`, {
                credentials: 'include',
                skipLoader: true,
              });
              let c = 0;
              if (res.ok) {
                const data = await res.json().catch(() => 0);
                if (typeof data === 'number') c = data;
                else if (Array.isArray(data)) c = data.length;
                else c = Number(data?.count ?? data?.total) || 0;
              }
              const seenKey = storageKey('outgoing', status);
              if (status === 'pending') {
                // Requesters shouldn't get "new" badges for their own submissions
                localStorage.setItem(seenKey, String(c));
                newOutgoing[status] = { count: c, hasNew: false, newCount: 0 };
              } else if (c === 0) {
                localStorage.setItem(seenKey, '0');
                newOutgoing[status] = { count: 0, hasNew: false, newCount: 0 };
              } else {
                const storedSeen = localStorage.getItem(seenKey);
                const seen = storedSeen === null ? c : Number(storedSeen);
                if (storedSeen === null) {
                  localStorage.setItem(seenKey, String(c));
                }
                const delta = Math.max(0, c - seen);
                newOutgoing[status] = {
                  count: c,
                  hasNew: delta > 0,
                  newCount: delta,
                };
              }
            } catch {
              newOutgoing[status] = { count: 0, hasNew: false, newCount: 0 };
            }
          }),
        );

        if (!cancelled) {
          setIncoming(newIncoming);
          setOutgoing(newOutgoing);
        }
      } finally {
        inFlight.current = false;
      }
    }

    fetchCountsRef.current = fetchCounts;
    fetchCounts();
    let timer;

    function startPolling(delayMs = intervalSeconds * 1000) {
      if (timer) return;
      timer = setTimeout(function tick() {
        fetchCounts();
        timer = setTimeout(
          tick,
          (typeof document !== 'undefined' && document.visibilityState === 'hidden'
            ? HIDDEN_POLL_INTERVAL_SECONDS
            : intervalSeconds) * 1000,
        );
      }, delayMs);
    }

    function stopPolling() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    let socket;
    try {
      socket = connectSocket();
      socket.on('newRequest', fetchCounts);
      socket.on('requestResolved', fetchCounts);
      if (pollingEnabled) {
        socket.on('connect_error', () => startPolling());
        socket.on('disconnect', () => startPolling(HIDDEN_POLL_INTERVAL_SECONDS * 1000));
        socket.on('connect', () => {
          stopPolling();
          fetchCounts();
        });
      }
    } catch {
      if (pollingEnabled) startPolling();
    }

    const handleVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
        return;
      }
      fetchCounts();
      if (pollingEnabled) startPolling();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      cancelled = true;
      fetchCountsRef.current = () => Promise.resolve();
      if (socket) {
        socket.off('newRequest', fetchCounts);
        socket.off('requestResolved', fetchCounts);
        if (pollingEnabled) {
          socket.off('connect_error', startPolling);
          socket.off('disconnect', startPolling);
          socket.off('connect', stopPolling);
        }
        disconnectSocket();
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      stopPolling();
    };
  }, [supervisorIds, filterKey, pollingEnabled, intervalSeconds, storageKey]);

  const refresh = useCallback(() => {
    try {
      return fetchCountsRef.current();
    } catch (err) {
      return Promise.reject(err);
    }
  }, []);

  const hasNew =
    STATUSES.some((s) => incoming[s].hasNew) ||
    ['accepted', 'declined'].some((s) => outgoing[s].hasNew);

  return {
    incoming,
    outgoing,
    hasNew,
    markSeen,
    markIncoming,
    markOutgoing,
    markStatuses: markStatusesAsSeen,
    refresh,
  };
}


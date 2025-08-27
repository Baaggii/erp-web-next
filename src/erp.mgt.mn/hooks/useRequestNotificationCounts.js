import { useEffect, useState, useCallback, useMemo } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const STATUSES = ['pending', 'accepted', 'declined'];

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
) {
  const [incoming, setIncoming] = useState(createInitial);
  const [outgoing, setOutgoing] = useState(createInitial);
  const cfg = useGeneralConfig();
  const pollingEnabled = !!cfg?.general?.requestPollingEnabled;
  const intervalSeconds =
    Number(cfg?.general?.requestPollingIntervalSeconds) ||
    DEFAULT_POLL_INTERVAL_SECONDS;

  const storageKey = useCallback(
    (type, status) => `${empid}-${type}-${status}-seen`,
    [empid],
  );

  const markSeen = useCallback(() => {
    setIncoming((prev) => {
      const next = { ...prev };
      STATUSES.forEach((s) => {
        localStorage.setItem(storageKey('incoming', s), String(prev[s].count));
        next[s] = { ...prev[s], hasNew: false, newCount: 0 };
      });
      return next;
    });
    setOutgoing((prev) => {
      const next = { ...prev };
      STATUSES.forEach((s) => {
        localStorage.setItem(storageKey('outgoing', s), String(prev[s].count));
        next[s] = { ...prev[s], hasNew: false, newCount: 0 };
      });
      return next;
    });
  }, [storageKey]);

  const memoFilters = useMemo(() => filters || {}, [filters]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      const newIncoming = createInitial();
      const newOutgoing = createInitial();

      await Promise.all(
        STATUSES.map(async (status) => {
          // Incoming requests (for seniors)
          if (seniorEmpId) {
            try {
              const params = new URLSearchParams({
                status,
                senior_empid: String(seniorEmpId),
              });
              Object.entries(memoFilters).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') {
                  params.append(k, v);
                }
              });
              const res = await fetch(
                `/api/pending_request?${params.toString()}`,
                { credentials: 'include', skipLoader: true },
              );
              let c = 0;
              if (res.ok) {
                const data = await res.json().catch(() => 0);
                if (typeof data === 'number') c = data;
                else if (Array.isArray(data)) c = data.length;
                else c = Number(data?.count ?? data?.total) || 0;
              }
              const seenKey = storageKey('incoming', status);
              if (c === 0) {
                localStorage.setItem(seenKey, '0');
                newIncoming[status] = { count: 0, hasNew: false, newCount: 0 };
              } else {
                const storedSeen = localStorage.getItem(seenKey);
                const seen = storedSeen === null ? c : Number(storedSeen);
                if (storedSeen === null) {
                  localStorage.setItem(seenKey, String(c));
                }
                const delta = Math.max(0, c - seen);
                newIncoming[status] = {
                  count: c,
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
            const res = await fetch(
              `/api/pending_request/outgoing?${params.toString()}`,
              { credentials: 'include', skipLoader: true },
            );
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
    }

    fetchCounts();
    let timer;

    function startPolling() {
      if (!timer) timer = setInterval(fetchCounts, intervalSeconds * 1000);
    }

    function stopPolling() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    let socket;
    try {
      socket = connectSocket();
      socket.on('newRequest', fetchCounts);
      socket.on('requestResolved', fetchCounts);
      if (pollingEnabled) {
        socket.on('connect_error', startPolling);
        socket.on('disconnect', startPolling);
        socket.on('connect', stopPolling);
      }
    } catch {
      if (pollingEnabled) startPolling();
    }

    return () => {
      cancelled = true;
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
      stopPolling();
    };
  }, [seniorEmpId, memoFilters, pollingEnabled, intervalSeconds, storageKey]);

  const hasNew =
    STATUSES.some((s) => incoming[s].hasNew) ||
    ['accepted', 'declined'].some((s) => outgoing[s].hasNew);

  return { incoming, outgoing, hasNew, markSeen };
}


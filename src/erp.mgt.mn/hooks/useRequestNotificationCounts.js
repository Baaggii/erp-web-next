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

function createInitialSeen() {
  return {
    incoming: { pending: 0, accepted: 0, declined: 0 },
    outgoing: { accepted: 0, declined: 0 },
  };
}

export default function useRequestNotificationCounts(seniorEmpId, filters) {
  const [incoming, setIncoming] = useState(createInitial);
  const [outgoing, setOutgoing] = useState(createInitial);
  const [seen, setSeen] = useState(createInitialSeen);
  const cfg = useGeneralConfig();
  const pollingEnabled = !!cfg?.general?.requestPollingEnabled;
  const intervalSeconds =
    Number(cfg?.general?.requestPollingIntervalSeconds) ||
    DEFAULT_POLL_INTERVAL_SECONDS;

  const markSeen = useCallback(async () => {
    const payload = {
      incoming: {
        pending: incoming.pending.count,
        accepted: incoming.accepted.count,
        declined: incoming.declined.count,
      },
      outgoing: {
        accepted: outgoing.accepted.count,
        declined: outgoing.declined.count,
      },
    };
    try {
      await fetch('/api/pending_request/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
    } catch {}
    setSeen(payload);
    setIncoming((prev) => {
      const next = { ...prev };
      STATUSES.forEach((s) => {
        next[s] = { ...prev[s], hasNew: false, newCount: 0 };
      });
      return next;
    });
    setOutgoing((prev) => {
      const next = { ...prev };
      STATUSES.forEach((s) => {
        next[s] = { ...prev[s], hasNew: false, newCount: 0 };
      });
      return next;
    });
  }, [incoming, outgoing]);

  const memoFilters = useMemo(() => filters || {}, [filters]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      const newIncoming = createInitial();
      const newOutgoing = createInitial();

      let seenData = createInitialSeen();
      try {
        const res = await fetch('/api/pending_request/seen', {
          credentials: 'include',
          skipLoader: true,
        });
        if (res.ok) {
          seenData = await res.json().catch(() => createInitialSeen());
        }
      } catch {}

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
                else c = Number(data?.count) || 0;
              }
              const seen = seenData.incoming[status] || 0;
              const delta = Math.max(0, c - seen);
              newIncoming[status] = {
                count: c,
                hasNew: delta > 0,
                newCount: delta,
              };
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
              else c = Number(data?.count) || 0;
            }
            if (status === 'pending') {
              newOutgoing[status] = { count: c, hasNew: false, newCount: 0 };
            } else {
              const seen = seenData.outgoing[status] || 0;
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
        setSeen(seenData);
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
  }, [seniorEmpId, memoFilters, pollingEnabled, intervalSeconds]);

  useEffect(() => {
    function handleFlush() {
      markSeen();
    }
    window.addEventListener('notifications:flush', handleFlush);
    return () => window.removeEventListener('notifications:flush', handleFlush);
  }, [markSeen]);

  const hasNew =
    STATUSES.some((s) => incoming[s].hasNew) ||
    ['accepted', 'declined'].some((s) => outgoing[s].hasNew);

  return { incoming, outgoing, hasNew, markSeen };
}


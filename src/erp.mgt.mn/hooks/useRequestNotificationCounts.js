import { useEffect, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

const STATUSES = ['pending', 'accepted', 'declined'];

function createInitial() {
  return {
    pending: { count: 0, hasNew: false },
    accepted: { count: 0, hasNew: false },
    declined: { count: 0, hasNew: false },
  };
}

export default function useRequestNotificationCounts(
  seniorEmpId,
  filters = {},
  interval = 30000,
) {
  const [incoming, setIncoming] = useState(createInitial);
  const [outgoing, setOutgoing] = useState(createInitial);

  const markSeen = useCallback(() => {
    setIncoming((prev) => {
      const next = { ...prev };
      STATUSES.forEach((s) => {
        localStorage.setItem(`incoming-${s}-seen`, String(prev[s].count));
        next[s] = { ...prev[s], hasNew: false };
      });
      return next;
    });
    setOutgoing((prev) => {
      const next = { ...prev };
      STATUSES.forEach((s) => {
        localStorage.setItem(`outgoing-${s}-seen`, String(prev[s].count));
        next[s] = { ...prev[s], hasNew: false };
      });
      return next;
    });
  }, []);

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
              Object.entries(filters).forEach(([k, v]) => {
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
              const seen = Number(
                localStorage.getItem(`incoming-${status}-seen`) || 0,
              );
              newIncoming[status] = { count: c, hasNew: c > seen };
            } catch {
              newIncoming[status] = { count: 0, hasNew: false };
            }
          } else {
            newIncoming[status] = { count: 0, hasNew: false };
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
            const seenKey = `outgoing-${status}-seen`;
            const seen =
              status === 'pending'
                ? c
                : Number(localStorage.getItem(seenKey) || 0);
            if (status === 'pending') {
              // Requesters shouldn't get "new" badges for their own submissions
              localStorage.setItem(seenKey, String(c));
              newOutgoing[status] = { count: c, hasNew: false };
            } else {
              newOutgoing[status] = { count: c, hasNew: c > seen };
            }
          } catch {
            newOutgoing[status] = { count: 0, hasNew: false };
          }
        }),
      );

      if (!cancelled) {
        setIncoming(newIncoming);
        setOutgoing(newOutgoing);
      }
    }

    fetchCounts();
    let timer = null;

    function startPolling() {
      timer = setInterval(fetchCounts, interval);
    }

    const restartPolling = () => {
      if (!timer) startPolling();
    };

    let socket;
    const handleConnect = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    try {
      socket = connectSocket();
      socket.on('newRequest', fetchCounts);
      socket.on('connect', handleConnect);
      socket.on('connect_error', restartPolling);
      socket.on('disconnect', restartPolling);
    } catch {
      restartPolling();
    }

    return () => {
      cancelled = true;
      if (socket) {
        socket.off('newRequest', fetchCounts);
        socket.off('connect', handleConnect);
        socket.off('connect_error', restartPolling);
        socket.off('disconnect', restartPolling);
        disconnectSocket();
      }
      if (timer) clearInterval(timer);
    };
  }, [seniorEmpId, interval, filters]);

  const hasNew =
    STATUSES.some((s) => incoming[s].hasNew) ||
    ['accepted', 'declined'].some((s) => outgoing[s].hasNew);

  return { incoming, outgoing, hasNew, markSeen };
}


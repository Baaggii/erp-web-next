import { useEffect, useState } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

/**
 * Polls the pending request endpoint for a supervisor and returns the count.
 * @param {string|number} seniorEmpId Employee ID of the supervisor
 * @param {object} [filters] Optional filters (requested_empid, table_name, date_from, date_to)
 * @param {number} [interval=30000] Polling interval in milliseconds
 * @returns {{count:number, hasNew:boolean, markSeen:()=>void}}
 */
export default function usePendingRequestCount(
  seniorEmpId,
  filters = {},
  interval = 30000,
) {
  const [count, setCount] = useState(0);
  const [seen, setSeen] = useState(() =>
    Number(localStorage.getItem('pendingSeen') || 0),
  );
  const [hasNew, setHasNew] = useState(false);

  const markSeen = () => {
    localStorage.setItem('pendingSeen', String(count));
    setSeen(count);
    setHasNew(false);
    window.dispatchEvent(new Event('pending-request-seen'));
  };

  useEffect(() => {
    if (!seniorEmpId) {
      setCount(0);
      return undefined;
    }

    const params = new URLSearchParams({
      status: 'pending',
      senior_empid: String(seniorEmpId),
    });
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, v);
      }
    });

    let cancelled = false;
    async function fetchCount() {
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
          const storedSeen = Number(localStorage.getItem('pendingSeen') || 0);
          const newHasNew = c > storedSeen;
          setHasNew(newHasNew);
          if (newHasNew) window.dispatchEvent(new Event('pending-request-new'));
        }
      } catch {
        if (!cancelled) {
          setCount(0);
          setHasNew(false);
        }
      }
    }

    fetchCount();
    let timer;

    function startPolling() {
      if (!timer) timer = setInterval(fetchCount, interval);
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
      socket.on('newRequest', fetchCount);
      socket.on('connect_error', startPolling);
      socket.on('disconnect', startPolling);
      socket.on('connect', stopPolling);
    } catch {
      startPolling();
    }
    function handleSeen() {
      const s = Number(localStorage.getItem('pendingSeen') || 0);
      setSeen(s);
      setHasNew(count > s);
    }
    function handleNew() {
      setHasNew(true);
    }
    window.addEventListener('pending-request-refresh', fetchCount);
    window.addEventListener('pending-request-seen', handleSeen);
    window.addEventListener('pending-request-new', handleNew);
    return () => {
      cancelled = true;
      if (socket) {
        socket.off('newRequest', fetchCount);
        socket.off('connect_error', startPolling);
        socket.off('disconnect', startPolling);
        socket.off('connect', stopPolling);
        disconnectSocket();
      }
      stopPolling();
      window.removeEventListener('pending-request-refresh', fetchCount);
      window.removeEventListener('pending-request-seen', handleSeen);
      window.removeEventListener('pending-request-new', handleNew);
    };
  }, [seniorEmpId, interval, filters]);

  return { count, hasNew, markSeen };
}


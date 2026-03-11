import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

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

  useEffect(() => {
    if (!effectiveSeniorEmpId) {
      setCount(0);
      setHasNew(false);
      return () => {};
    }

    let cancelled = false;
    let socket;

    const applyFromFetch = async () => {
      const value = await fetchCount();
      if (!cancelled) applyCount(value);
    };

    const handleNotification = (payload) => {
      if (!payload) return;
      const kind = payload?.kind;
      if (kind) {
        if (kind !== 'request') return;
      } else if (payload.type !== 'request') {
        return;
      }
      applyFromFetch();
    };

    applyFromFetch();

    try {
      socket = connectSocket();
      socket.on('notification:new', handleNotification);
      socket.on('connect', applyFromFetch);
    } catch (err) {
      console.warn('Failed to connect pending request socket', err);
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
      if (socket) {
        socket.off('notification:new', handleNotification);
        socket.off('connect', applyFromFetch);
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
    storageKey,
  ]);

  return { count, hasNew, markSeen };
}

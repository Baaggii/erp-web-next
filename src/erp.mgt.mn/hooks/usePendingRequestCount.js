import { useEffect, useState } from 'react';

/**
 * Polls the pending request endpoint for an employee and returns the count.
 * Always hits the server using the provided empId.
 * @param {string|number} empId Employee ID to check for incoming requests
 * @param {object} [filters] Optional filters (requested_empid, table_name, date_from, date_to)
 * @param {number} [interval=30000] Polling interval in milliseconds
 * @returns {{count:number, hasNew:boolean, markSeen:()=>void}}
 */
export default function usePendingRequestCount(
  empId,
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
    const params = new URLSearchParams({ status: 'pending' });
    if (empId !== undefined && empId !== null && empId !== '') {
      // Include both senior and requested empid so non-senior users
      // receive their incoming request counts as well
      params.append('senior_empid', String(empId));
      params.append('requested_empid', String(empId));
    }
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
    const timer = setInterval(fetchCount, interval);
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
      clearInterval(timer);
      window.removeEventListener('pending-request-refresh', fetchCount);
      window.removeEventListener('pending-request-seen', handleSeen);
      window.removeEventListener('pending-request-new', handleNew);
    };
  }, [empId, interval, filters]);

  return { count, hasNew, markSeen };
}


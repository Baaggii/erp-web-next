import { useEffect, useState } from 'react';

/**
 * Polls the pending request endpoint for a supervisor and returns the count.
 * @param {string|number} seniorEmpId Employee ID of the supervisor
 * @param {object} [filters] Optional filters (requested_empid, table_name, date_from, date_to)
 * @param {number} [interval=30000] Polling interval in milliseconds
 * @returns {number} Count of pending requests
 */
export default function usePendingRequestCount(
  seniorEmpId,
  filters = {},
  interval = 30000,
) {
  const [count, setCount] = useState(0);

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
        if (!cancelled) setCount(c);
      } catch {
        if (!cancelled) setCount(0);
      }
    }

    fetchCount();
    const timer = setInterval(fetchCount, interval);
    window.addEventListener('pending-request-refresh', fetchCount);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('pending-request-refresh', fetchCount);
    };
  }, [seniorEmpId, interval, filters]);

  return count;
}


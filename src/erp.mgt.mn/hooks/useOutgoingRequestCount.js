import { useEffect, useState } from 'react';

/**
 * Polls the outgoing request endpoint and returns counts for each status.
 * Tracks "seen" counts in localStorage per status and exposes whether
 * new updates exist for any category. A seen count is stored under keys
 * `outgoingSeen_<status>`.
 *
 * @param {number} [interval=30000] Polling interval in milliseconds
 * @returns {{counts:object, hasNew:object, markSeen:(status?:string)=>void}}
 */
export default function useOutgoingRequestCount(interval = 30000) {
  const statuses = ['pending', 'accepted', 'declined'];
  const [counts, setCounts] = useState({ pending: 0, accepted: 0, declined: 0 });
  const [hasNew, setHasNew] = useState({ pending: false, accepted: false, declined: false });

  const markSeen = (status) => {
    const update = (s) => {
      localStorage.setItem(`outgoingSeen_${s}`, String(counts[s] || 0));
    };
    if (status) update(status);
    else statuses.forEach(update);
    setHasNew((prev) => ({
      pending: status && status !== 'pending' ? prev.pending : false,
      accepted: status && status !== 'accepted' ? prev.accepted : false,
      declined: status && status !== 'declined' ? prev.declined : false,
    }));
    window.dispatchEvent(new Event('outgoing-request-seen'));
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      try {
        const results = await Promise.all(
          statuses.map(async (status) => {
            const params = new URLSearchParams({ status });
            const res = await fetch(`/api/pending_request/outgoing?${params.toString()}`, {
              credentials: 'include',
              skipLoader: true,
            });
            if (!res.ok) return 0;
            const data = await res.json().catch(() => 0);
            if (typeof data === 'number') return data;
            if (Array.isArray(data)) return data.length;
            return Number(data?.count) || 0;
          }),
        );
        if (!cancelled) {
          const newCounts = { pending: results[0], accepted: results[1], declined: results[2] };
          setCounts(newCounts);
          const newHasNew = {
            pending: newCounts.pending > Number(localStorage.getItem('outgoingSeen_pending') || 0),
            accepted: newCounts.accepted > Number(localStorage.getItem('outgoingSeen_accepted') || 0),
            declined: newCounts.declined > Number(localStorage.getItem('outgoingSeen_declined') || 0),
          };
          setHasNew(newHasNew);
          if (Object.values(newHasNew).some(Boolean)) {
            window.dispatchEvent(new Event('outgoing-request-new'));
          }
        }
      } catch {
        if (!cancelled) {
          setCounts({ pending: 0, accepted: 0, declined: 0 });
          setHasNew({ pending: false, accepted: false, declined: false });
        }
      }
    }

    fetchCounts();
    const timer = setInterval(fetchCounts, interval);

    function handleSeen() {
      setHasNew({
        pending: counts.pending > Number(localStorage.getItem('outgoingSeen_pending') || 0),
        accepted: counts.accepted > Number(localStorage.getItem('outgoingSeen_accepted') || 0),
        declined: counts.declined > Number(localStorage.getItem('outgoingSeen_declined') || 0),
      });
    }

    window.addEventListener('outgoing-request-refresh', fetchCounts);
    window.addEventListener('outgoing-request-seen', handleSeen);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('outgoing-request-refresh', fetchCounts);
      window.removeEventListener('outgoing-request-seen', handleSeen);
    };
  }, [interval, counts.pending, counts.accepted, counts.declined]);

  return { counts, hasNew, markSeen };
}


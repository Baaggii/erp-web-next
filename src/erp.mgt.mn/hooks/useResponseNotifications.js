import { useEffect, useState, useCallback } from 'react';

export default function useResponseNotifications(interval = 30000) {
  const [notifications, setNotifications] = useState([]);
  const [counts, setCounts] = useState({ accepted: 0, declined: 0 });
  const [hasNew, setHasNew] = useState(false);

  const markSeen = useCallback(async () => {
    const ids = notifications.map((n) => n.notification_id);
    try {
      await fetch('/api/notifications/mark-seen', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch {}
    setNotifications([]);
    setCounts({ accepted: 0, declined: 0 });
    setHasNew(false);
  }, [notifications]);

  useEffect(() => {
    let cancelled = false;
    async function fetchNotifications() {
      try {
        const res = await fetch('/api/notifications', {
          credentials: 'include',
          skipLoader: true,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setNotifications(data);
        const acc = data.filter((n) => n.status === 'accepted').length;
        const dec = data.filter((n) => n.status === 'declined').length;
        setCounts({ accepted: acc, declined: dec });
        setHasNew(data.length > 0);
      } catch {}
    }
    fetchNotifications();
    const timer = setInterval(fetchNotifications, interval);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [interval]);

  return { notifications, counts, hasNew, markSeen };
}

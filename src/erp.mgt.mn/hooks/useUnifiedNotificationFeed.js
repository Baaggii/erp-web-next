import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../utils/apiBase.js';

const DEFAULT_CHUNK_SIZE = 20;

export default function useUnifiedNotificationFeed(isActive) {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inFlightRef = useRef(false);

  const fetchChunk = useCallback(async (cursorToken = null, reset = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(DEFAULT_CHUNK_SIZE) });
      if (cursorToken) params.set('cursor', cursorToken);
      const res = await fetch(`${API_BASE}/transactions/notifications/feed?${params.toString()}`, {
        credentials: 'include',
        skipErrorToast: true,
        skipLoader: true,
      });
      if (!res.ok) {
        setHasMore(false);
        setLoaded(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows((prev) => (reset ? nextRows : prev.concat(nextRows)));
      setCursor(data?.nextCursor || null);
      setHasMore(Boolean(data?.hasMore));
      setLoaded(true);
    } catch {
      setHasMore(false);
      setLoaded(true);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setRows([]);
    setCursor(null);
    setHasMore(true);
    return fetchChunk(null, true);
  }, [fetchChunk]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    return fetchChunk(cursor, false);
  }, [cursor, fetchChunk, hasMore, loading]);

  useEffect(() => {
    if (!isActive || loaded) return;
    fetchChunk(null, true);
  }, [fetchChunk, isActive, loaded]);

  const unreadCount = useMemo(
    () => rows.filter((item) => item?.isUnread).length,
    [rows],
  );

  return {
    rows,
    unreadCount,
    hasMore,
    loading,
    refresh,
    loadMore,
  };
}

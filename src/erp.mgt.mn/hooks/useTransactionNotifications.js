import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_LIMIT = 8;
const POLL_INTERVAL_MS = 60000;

function parseNotificationMessage(message) {
  if (!message) return { summary: '', transactionName: '', tableName: '' };
  if (typeof message === 'object') {
    return {
      summary: message.summary || '',
      transactionName: message.transactionName || message.name || '',
      tableName: message.tableName || '',
      recordId: message.recordId ?? null,
      action: message.action || '',
    };
  }
  if (typeof message === 'string') {
    const trimmed = message.trim();
    if (!trimmed) return { summary: '', transactionName: '', tableName: '' };
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          summary: parsed.summary || '',
          transactionName: parsed.transactionName || parsed.name || '',
          tableName: parsed.tableName || '',
          recordId: parsed.recordId ?? null,
          action: parsed.action || '',
        };
      } catch {
        // ignore
      }
    }
    return { summary: trimmed, transactionName: '', tableName: '' };
  }
  return { summary: String(message), transactionName: '', tableName: '' };
}

export default function useTransactionNotifications({ limit = DEFAULT_LIMIT } = {}) {
  const [state, setState] = useState({
    entries: [],
    unreadCount: 0,
    loading: true,
    error: '',
  });
  const pollingRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      const res = await fetch(`/api/notifications?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load notifications');
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const entries = rows.map((row) => {
        const parsed = parseNotificationMessage(row.message);
        return {
          ...row,
          ...parsed,
          createdAt: row.created_at || row.createdAt,
        };
      });
      const filteredEntries = entries.filter(
        (entry) => entry.transactionName || entry.tableName,
      );
      const filteredUnread = filteredEntries.filter((entry) => !entry.is_read).length;
      setState((prev) => ({
        ...prev,
        entries: filteredEntries,
        unreadCount: filteredUnread,
        loading: false,
        error: '',
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Failed to load notifications',
      }));
    }
  }, [limit]);

  const markRead = useCallback(async (ids = []) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setState((prev) => ({
          ...prev,
          entries: prev.entries.map((entry) =>
            ids.includes(entry.notification_id)
              ? { ...entry, is_read: 1 }
              : entry,
          ),
          unreadCount: Math.max(
            0,
            prev.unreadCount - ids.filter((id) => prev.entries.find((e) => e.notification_id === id && !e.is_read)).length,
          ),
        }));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    pollingRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchNotifications]);

  return {
    ...state,
    refresh: fetchNotifications,
    markRead,
  };
}

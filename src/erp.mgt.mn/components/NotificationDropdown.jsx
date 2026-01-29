import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import LangContext from '../context/I18nContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import NotificationDots, { DEFAULT_NOTIFICATION_COLOR } from './NotificationDots.jsx';

const FETCH_LIMIT = 50;
const REFRESH_MS = 60000;

function groupNotifications(list, fallbackLabel) {
  const map = new Map();
  list.forEach((entry) => {
    const label = entry.transactionName || fallbackLabel;
    const createdAt = entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
    const existing = map.get(label) || {
      label,
      entries: [],
      latest: 0,
      unreadCount: 0,
    };
    existing.entries.push(entry);
    existing.latest = Math.max(existing.latest, createdAt);
    if (!entry.isRead) existing.unreadCount += 1;
    map.set(label, existing);
  });
  return Array.from(map.values()).sort((a, b) => b.latest - a.latest);
}

export default function NotificationDropdown({
  onOpen,
  dashboardLabel,
  baseColors = [],
}) {
  const { t } = useContext(LangContext);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/notifications?limit=${FETCH_LIMIT}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to load notifications');
      }
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(rows);
    } catch (err) {
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!isOpen) return;
    fetchNotifications();
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      if (!dropdownRef.current || dropdownRef.current.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const colors = useMemo(() => {
    if (unreadCount === 0) return baseColors;
    const all = [...baseColors, DEFAULT_NOTIFICATION_COLOR];
    return Array.from(new Set(all));
  }, [baseColors, unreadCount]);

  const grouped = useMemo(
    () => groupNotifications(notifications, t('notifications_unknown_type', 'Other transactions')),
    [notifications, t],
  );

  const markGroupRead = useCallback(async (entries) => {
    const ids = entries.map((entry) => entry.id).filter(Boolean);
    if (ids.length === 0) return;
    try {
      await fetch('/api/notifications/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids }),
      });
      setNotifications((prev) =>
        prev.map((entry) =>
          ids.includes(entry.id) ? { ...entry, isRead: true } : entry,
        ),
      );
    } catch {
      // ignore
    }
  }, []);

  const handleOpenGroup = useCallback(
    async (group) => {
      if (!group) return;
      await markGroupRead(group.entries || []);
      const params = new URLSearchParams({
        tab: 'notifications',
        highlight: group.label,
      });
      onOpen(`/?${params.toString()}`, dashboardLabel, 'dashboard');
      setIsOpen(false);
    },
    [dashboardLabel, markGroupRead, onOpen],
  );

  return (
    <div ref={dropdownRef} style={styles.container}>
      <button
        type="button"
        style={styles.trigger}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span style={styles.inlineButtonContent}>
          <NotificationDots colors={colors} marginRight={0} />
          <span aria-hidden="true">🔔</span> {t('notifications', 'Notifications')}
        </span>
      </button>
      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>
            <div>
              <div style={styles.headerTitle}>
                {t('notifications', 'Notifications')}
              </div>
              <div style={styles.headerSubtitle}>
                {unreadCount > 0
                  ? t('notifications_new_summary', '{{count}} new updates', {
                      count: unreadCount,
                    })
                  : t('notifications_up_to_date', 'You are all caught up')}
              </div>
            </div>
            <button
              type="button"
              style={styles.refreshButton}
              onClick={fetchNotifications}
            >
              {t('refresh', 'Refresh')}
            </button>
          </div>
          {loading && (
            <div style={styles.statusText}>
              {t('loading', 'Loading')}...
            </div>
          )}
          {error && <div style={styles.errorText}>{error}</div>}
          {!loading && !error && grouped.length === 0 && (
            <div style={styles.statusText}>
              {t('notifications_none', 'No notifications')}
            </div>
          )}
          {!loading && !error && grouped.length > 0 && (
            <div style={styles.list}>
              {grouped.map((group) => {
                const latestEntry = group.entries[0];
                const latestTime = latestEntry?.createdAt
                  ? formatTimestamp(latestEntry.createdAt)
                  : '-';
                return (
                  <button
                    key={group.label}
                    type="button"
                    style={{
                      ...styles.groupRow,
                      ...(group.unreadCount > 0 ? styles.groupRowUnread : {}),
                    }}
                    onClick={() => handleOpenGroup(group)}
                  >
                    <div style={styles.groupHeader}>
                      <span style={styles.groupTitle}>{group.label}</span>
                      {group.unreadCount > 0 && (
                        <span style={styles.unreadBadge}>{group.unreadCount}</span>
                      )}
                    </div>
                    <div style={styles.groupMeta}>
                      <span>{latestEntry?.message || '-'}</span>
                      <span>{latestTime}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div style={styles.dropdownFooter}>
            <button
              type="button"
              style={styles.footerButton}
              onClick={() => onOpen('/notifications', t('notifications', 'Notifications'), 'notifications')}
            >
              {t('view_all', 'View all')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { position: 'relative' },
  trigger: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    position: 'relative',
  },
  inlineButtonContent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: '0.5rem',
    width: '340px',
    background: '#fff',
    borderRadius: '0.75rem',
    boxShadow: '0 15px 30px rgba(15, 23, 42, 0.15)',
    border: '1px solid #e5e7eb',
    zIndex: 200,
    overflow: 'hidden',
  },
  dropdownHeader: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.5rem',
    alignItems: 'center',
    background: '#f9fafb',
  },
  headerTitle: { fontWeight: 600, color: '#111827' },
  headerSubtitle: { fontSize: '0.8rem', color: '#6b7280' },
  refreshButton: {
    border: '1px solid #d1d5db',
    background: '#fff',
    borderRadius: '0.5rem',
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  list: { maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  groupRow: {
    textAlign: 'left',
    padding: '0.75rem 1rem',
    border: 'none',
    background: '#fff',
    borderBottom: '1px solid #f3f4f6',
    cursor: 'pointer',
  },
  groupRowUnread: {
    background: '#eff6ff',
  },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.25rem',
    color: '#111827',
  },
  groupTitle: { fontWeight: 600, fontSize: '0.9rem' },
  groupMeta: {
    fontSize: '0.75rem',
    color: '#6b7280',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  unreadBadge: {
    background: '#2563eb',
    color: '#fff',
    fontSize: '0.7rem',
    padding: '0.1rem 0.4rem',
    borderRadius: '999px',
  },
  statusText: {
    padding: '1rem',
    color: '#6b7280',
    fontSize: '0.85rem',
  },
  errorText: {
    padding: '1rem',
    color: '#b91c1c',
    fontSize: '0.85rem',
  },
  dropdownFooter: {
    padding: '0.75rem 1rem',
    borderTop: '1px solid #e5e7eb',
    background: '#f9fafb',
    textAlign: 'right',
  },
  footerButton: {
    border: '1px solid #d1d5db',
    background: '#fff',
    borderRadius: '0.5rem',
    padding: '0.35rem 0.75rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
};

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import LangContext from '../context/I18nContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import NotificationDots, { DEFAULT_NOTIFICATION_COLOR } from './NotificationDots.jsx';

const DROPDOWN_LIMIT = 8;

export default function HeaderNotificationDropdown({ onOpen, pendingColors = [] }) {
  const { t } = useContext(LangContext);
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  const hasUnread = unreadTotal > 0;
  const buttonColors = useMemo(() => {
    if (pendingColors.length) return pendingColors;
    if (hasUnread) return [DEFAULT_NOTIFICATION_COLOR];
    return [];
  }, [hasUnread, pendingColors]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: '1',
        per_page: String(DROPDOWN_LIMIT),
      });
      const res = await fetch(`/api/notifications?${params.toString()}`, {
        credentials: 'include',
        skipLoader: true,
      });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      setEntries(Array.isArray(data?.rows) ? data.rows : []);
      setUnreadTotal(Number(data?.unreadTotal) || 0);
    } catch (err) {
      setError(t('notifications_load_error', 'Unable to load notifications'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!isOpen) return;
    fetchNotifications();
  }, [fetchNotifications, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const markRead = useCallback(async (ids) => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // ignore errors for optimistic UI
    }
  }, []);

  const handleItemClick = async (entry) => {
    if (!entry) return;
    if (!entry.is_read) {
      const id = entry.notification_id;
      await markRead([id]);
      setEntries((prev) =>
        prev.map((item) =>
          item.notification_id === id ? { ...item, is_read: true } : item,
        ),
      );
      setUnreadTotal((prev) => Math.max(prev - 1, 0));
    }
    setIsOpen(false);
    onOpen(
      '/',
      t('dashboard', 'Dashboard'),
      'dashboard',
      {
        state: {
          highlightNotifications: true,
          highlightNotificationId: entry.notification_id,
          highlightTransaction: entry.transactionName || entry.tableName || '',
        },
      },
    );
  };

  const handleViewDashboard = () => {
    setIsOpen(false);
    onOpen(
      '/',
      t('dashboard', 'Dashboard'),
      'dashboard',
      { state: { highlightNotifications: true } },
    );
  };

  return (
    <div style={styles.container} ref={containerRef}>
      <button
        style={styles.iconBtn}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span style={styles.inlineButtonContent}>
          <NotificationDots colors={buttonColors} marginRight={0} />
          <span aria-hidden="true">🔔</span> {t('notifications', 'Notifications')}
        </span>
      </button>
      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>
            <span>{t('notifications', 'Notifications')}</span>
            {hasUnread && (
              <span style={styles.unreadBadge}>
                {t('notifications_unread_count', '{{count}} new', { count: unreadTotal })}
              </span>
            )}
          </div>
          <div style={styles.dropdownBody}>
            {loading && (
              <p style={styles.statusText}>
                {t('notifications_loading', 'Loading notifications...')}
              </p>
            )}
            {!loading && error && <p style={styles.statusText}>{error}</p>}
            {!loading && !error && entries.length === 0 && (
              <p style={styles.statusText}>{t('notifications_none', 'No notifications')}</p>
            )}
            {!loading &&
              !error &&
              entries.map((entry) => {
                const summary =
                  entry.summary ||
                  entry.message ||
                  t('notifications_update', 'New transaction update');
                const subtitle =
                  entry.transactionName ||
                  entry.tableName ||
                  t('notifications_unknown_type', 'Other transaction');
                return (
                  <button
                    key={entry.notification_id}
                    style={styles.item(entry.is_read)}
                    onClick={() => handleItemClick(entry)}
                  >
                    <div style={styles.itemText}>
                      <span style={styles.itemTitle}>{summary}</span>
                      <span style={styles.itemSubtitle}>{subtitle}</span>
                      <span style={styles.itemTime}>
                        {formatTimestamp(entry.created_at)}
                      </span>
                    </div>
                    {!entry.is_read && <span style={styles.unreadDot} />}
                  </button>
                );
              })}
          </div>
          <div style={styles.dropdownFooter}>
            <button style={styles.footerButton} onClick={handleViewDashboard}>
              {t('notifications_view_dashboard', 'View in dashboard')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { position: 'relative' },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  inlineButtonContent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '120%',
    width: '320px',
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
    zIndex: 1200,
    display: 'flex',
    flexDirection: 'column',
  },
  dropdownHeader: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 600,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unreadBadge: {
    fontSize: '0.75rem',
    background: '#fee2e2',
    color: '#b91c1c',
    padding: '0.15rem 0.5rem',
    borderRadius: '999px',
  },
  dropdownBody: {
    maxHeight: '360px',
    overflowY: 'auto',
  },
  statusText: {
    margin: 0,
    padding: '0.75rem 1rem',
    color: '#6b7280',
    fontSize: '0.85rem',
  },
  item: (isRead) => ({
    width: '100%',
    border: 'none',
    background: isRead ? '#fff' : '#f0f9ff',
    padding: '0.75rem 1rem',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    borderBottom: '1px solid #e5e7eb',
  }),
  itemText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  itemTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#111827',
  },
  itemSubtitle: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  itemTime: {
    fontSize: '0.7rem',
    color: '#9ca3af',
  },
  unreadDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#2563eb',
  },
  dropdownFooter: {
    padding: '0.5rem',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'center',
  },
  footerButton: {
    background: 'transparent',
    border: 'none',
    color: '#2563eb',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

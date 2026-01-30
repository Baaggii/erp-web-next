import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactionNotifications } from '../context/TransactionNotificationsContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

export default function TransactionNotificationMenu() {
  const navigate = useNavigate();
  const {
    groups,
    unreadCount,
    loading,
    error,
    markRead,
  } = useTransactionNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const latestGroups = useMemo(() => groups.slice(0, 6), [groups]);

  useEffect(() => {
    const handler = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClickNotification = async (entry, groupName) => {
    if (entry?.id) {
      await markRead(entry.id);
    }
    setOpen(false);
    navigate('/notifications', {
      state: { highlightGroup: groupName },
    });
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <button
        type="button"
        style={styles.bellButton}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
      >
        <span style={styles.bellIcon} aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span style={styles.badge}>{unreadCount}</span>
        )}
      </button>
      {open && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>Notifications</div>
          {loading && <div style={styles.status}>Loading...</div>}
          {error && <div style={styles.error}>{error}</div>}
          {!loading && !error && latestGroups.length === 0 && (
            <div style={styles.status}>No notifications</div>
          )}
          {latestGroups.map((group) => {
            const latest = group.entries[0];
            const time = latest?.createdAt
              ? formatTimestamp(latest.createdAt)
              : '';
            return (
              <button
                key={group.name}
                type="button"
                style={styles.groupButton(group.unreadCount > 0)}
                onClick={() => handleClickNotification(latest, group.name)}
              >
                <div style={styles.groupTitle}>{group.name}</div>
                <div style={styles.groupSummary}>
                  {latest?.summary || latest?.message || ''}
                </div>
                <div style={styles.groupMeta}>
                  <span>{time}</span>
                  {group.unreadCount > 0 && (
                    <span style={styles.unreadDot}>●</span>
                  )}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            style={styles.viewAllButton}
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            View all
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    marginLeft: '0.5rem',
  },
  bellButton: {
    position: 'relative',
    border: 'none',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.35rem 0.5rem',
  },
  bellIcon: {
    fontSize: '1rem',
  },
  badge: {
    position: 'absolute',
    top: '-0.1rem',
    right: '-0.1rem',
    background: '#ef4444',
    color: '#fff',
    borderRadius: '999px',
    fontSize: '0.65rem',
    padding: '0.1rem 0.35rem',
    minWidth: '1.1rem',
    textAlign: 'center',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '2.2rem',
    width: '22rem',
    background: '#fff',
    borderRadius: '0.75rem',
    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.15)',
    zIndex: 999,
    overflow: 'hidden',
  },
  dropdownHeader: {
    fontWeight: 600,
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb',
  },
  status: {
    padding: '1rem',
    fontSize: '0.9rem',
    color: '#6b7280',
  },
  error: {
    padding: '1rem',
    fontSize: '0.9rem',
    color: '#b91c1c',
  },
  groupButton: (hasUnread) => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: hasUnread ? '#f9fafb' : '#fff',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb',
    cursor: 'pointer',
  }),
  groupTitle: {
    fontWeight: 600,
    marginBottom: '0.25rem',
    fontSize: '0.95rem',
    color: '#111827',
  },
  groupSummary: {
    fontSize: '0.85rem',
    color: '#4b5563',
    marginBottom: '0.35rem',
  },
  groupMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: '#9ca3af',
  },
  unreadDot: {
    color: '#ef4444',
  },
  viewAllButton: {
    width: '100%',
    border: 'none',
    background: '#f3f4f6',
    padding: '0.75rem 1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

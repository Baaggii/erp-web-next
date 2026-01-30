import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactionNotifications } from '../context/TransactionNotificationContext.jsx';

function formatNotificationFields(fields = []) {
  if (!Array.isArray(fields) || fields.length === 0) return '';
  return fields
    .map((entry) => {
      const field = entry?.field ? String(entry.field).trim() : '';
      const rawValue = entry?.value;
      const value =
        rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();
      if (!field || !value) return '';
      return `${field}: ${value}`;
    })
    .filter(Boolean)
    .join(' • ');
}

export default function TransactionNotificationDropdown() {
  const { groups, unreadCount, markGroupRead } = useTransactionNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const sortedGroups = useMemo(() => groups.slice(0, 8), [groups]);

  useEffect(() => {
    const handleClick = (event) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleGroupClick = async (group) => {
    if (!group) return;
    setOpen(false);
    await markGroupRead(group.key);
    navigate(`/?notifyGroup=${group.key}`);
  };

  return (
    <div style={styles.wrapper} ref={containerRef}>
      <button
        type="button"
        style={styles.button}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
      </button>
      {open && (
        <div style={styles.dropdown}>
          <div style={styles.header}>
            <span style={styles.headerTitle}>Notifications</span>
            <span style={styles.headerCount}>
              {unreadCount} unread
            </span>
          </div>
          <div style={styles.list}>
            {sortedGroups.length === 0 && (
              <div style={styles.empty}>No notifications yet</div>
            )}
            {sortedGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                style={styles.item(group.unreadCount > 0)}
                onClick={() => handleGroupClick(group)}
              >
                <div style={styles.itemTitle}>{group.name}</div>
                <div style={styles.itemMeta}>
                  {group.unreadCount > 0
                    ? `${group.unreadCount} unread`
                    : `${group.items.length} total`}
                </div>
                <div style={styles.itemPreview}>
                  {formatNotificationFields(group.items[0]?.notificationFields) ||
                    group.items[0]?.notificationText ||
                    group.items[0]?.summaryText ||
                    'New transaction activity'}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            style={styles.footer}
            onClick={() => {
              setOpen(false);
              navigate('/');
            }}
          >
            Open dashboard
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: 'relative',
    marginLeft: '0.75rem',
  },
  button: {
    position: 'relative',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1.05rem',
    padding: '0.35rem 0.5rem',
    borderRadius: '999px',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-2px',
    background: '#e11d48',
    color: '#fff',
    borderRadius: '999px',
    fontSize: '0.7rem',
    padding: '0 0.4rem',
    lineHeight: '1.3rem',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    marginTop: '0.4rem',
    width: '320px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 12px 30px rgba(15,23,42,0.2)',
    overflow: 'hidden',
    zIndex: 60,
  },
  header: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#f8fafc',
  },
  headerTitle: { fontWeight: 600, color: '#0f172a' },
  headerCount: { fontSize: '0.75rem', color: '#64748b' },
  list: {
    maxHeight: '360px',
    overflowY: 'auto',
  },
  empty: {
    padding: '1rem',
    color: '#64748b',
    textAlign: 'center',
  },
  item: (isUnread) => ({
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: isUnread ? '#eff6ff' : '#fff',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb',
    cursor: 'pointer',
  }),
  itemTitle: { fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' },
  itemMeta: { fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' },
  itemPreview: { fontSize: '0.85rem', color: '#334155' },
  footer: {
    width: '100%',
    border: 'none',
    background: '#f1f5f9',
    padding: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

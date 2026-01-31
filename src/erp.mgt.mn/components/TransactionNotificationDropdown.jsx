import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactionNotifications } from '../context/TransactionNotificationContext.jsx';

function getActionMeta(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (normalized === 'deleted' || normalized === 'delete') {
    return { label: 'Deleted', accent: '#dc2626' };
  }
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return { label: 'Edited', accent: '#2563eb' };
  }
  if (normalized === 'changed' || normalized === 'change') {
    return { label: 'Changed', accent: '#d97706' };
  }
  if (normalized) {
    return { label: normalized.charAt(0).toUpperCase() + normalized.slice(1), accent: '#059669' };
  }
  return { label: 'New', accent: '#059669' };
}

function buildPreviewText(item) {
  if (!item) return 'Transaction update';
  if (item.summaryText) return item.summaryText;
  const meta = getActionMeta(item.action);
  if (meta.label === 'Deleted') return 'Transaction deleted';
  if (meta.label === 'Edited') return 'Transaction edited';
  if (meta.label === 'Changed') return 'Transaction changed';
  return 'Transaction update';
}

export default function TransactionNotificationDropdown() {
  const { groups, unreadCount, markGroupRead } = useTransactionNotifications();
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
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
    navigate(`/?tab=activity&notifyGroup=${group.key}`);
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
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
            {sortedGroups.map((group) => {
              const latestItem = group.items[0];
              const actionMeta = getActionMeta(latestItem?.action);
              const isExpanded = expandedGroups.has(group.key);
              return (
                <div key={group.key} style={styles.group}>
                  <div style={styles.groupHeader(group.unreadCount > 0)}>
                    <button
                      type="button"
                      style={styles.groupInfo}
                      onClick={() => toggleGroup(group.key)}
                    >
                      <div style={styles.itemTitle}>
                        <span>{group.name}</span>
                        {latestItem && (
                          <span style={styles.actionBadge(actionMeta.accent)}>
                            {actionMeta.label}
                          </span>
                        )}
                      </div>
                      <div style={styles.itemMeta}>
                        {group.unreadCount > 0
                          ? `${group.unreadCount} unread`
                          : `${group.items.length} total`}
                      </div>
                      {!isExpanded && (
                        <div style={styles.itemPreview}>
                          {buildPreviewText(latestItem)}
                        </div>
                      )}
                    </button>
                    <div style={styles.groupActions}>
                      {group.items.length > 1 && (
                        <button
                          type="button"
                          style={styles.groupToggle}
                          onClick={() => toggleGroup(group.key)}
                        >
                          {isExpanded ? 'Hide' : 'Show'} {group.items.length}
                        </button>
                      )}
                      <button
                        type="button"
                        style={styles.groupOpen}
                        onClick={() => handleGroupClick(group)}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={styles.groupItems}>
                      {group.items.map((item) => {
                        const itemMeta = getActionMeta(item?.action);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            style={styles.groupItem(item.isRead === false)}
                            onClick={() => handleGroupClick(group)}
                          >
                            <div style={styles.groupItemTitle}>
                              <span>{item.transactionName || group.name}</span>
                              {item && (
                                <span style={styles.actionBadge(itemMeta.accent)}>
                                  {itemMeta.label}
                                </span>
                              )}
                            </div>
                            <div style={styles.groupItemPreview}>
                              {buildPreviewText(item)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            style={styles.footer}
            onClick={() => {
              setOpen(false);
              navigate('/?tab=activity');
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
  group: {
    borderBottom: '1px solid #e5e7eb',
  },
  groupHeader: (isUnread) => ({
    background: isUnread ? '#eff6ff' : '#fff',
    padding: '0.75rem 1rem',
  }),
  groupInfo: {
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
  },
  groupActions: {
    marginTop: '0.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  groupToggle: {
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#0f172a',
    borderRadius: '999px',
    fontSize: '0.7rem',
    padding: '0.15rem 0.65rem',
    cursor: 'pointer',
  },
  groupOpen: {
    border: 'none',
    background: '#0f172a',
    color: '#fff',
    borderRadius: '999px',
    fontSize: '0.7rem',
    padding: '0.15rem 0.65rem',
    cursor: 'pointer',
  },
  itemTitle: {
    fontWeight: 600,
    color: '#0f172a',
    marginBottom: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  actionBadge: (accent) => ({
    background: accent || '#2563eb',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.45rem',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }),
  itemMeta: { fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' },
  itemPreview: { fontSize: '0.85rem', color: '#334155' },
  groupItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    padding: '0 1rem 0.9rem',
    background: '#f8fafc',
  },
  groupItem: (isUnread) => ({
    width: '100%',
    textAlign: 'left',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    background: isUnread ? '#eff6ff' : '#fff',
    padding: '0.6rem 0.75rem',
    cursor: 'pointer',
  }),
  groupItemTitle: {
    fontWeight: 600,
    color: '#0f172a',
    marginBottom: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  groupItemPreview: {
    fontSize: '0.8rem',
    color: '#334155',
  },
  footer: {
    width: '100%',
    border: 'none',
    background: '#f1f5f9',
    padding: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTransactionNotifications } from '../context/TransactionNotificationContext.jsx';

function formatTimestamp(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
}

function formatActionLabel(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return 'Edited';
  }
  if (normalized === 'changed' || normalized === 'change') {
    return 'Changed';
  }
  if (normalized === 'deleted' || normalized === 'delete') {
    return 'Deleted';
  }
  return 'New';
}

export default function TransactionNotificationWidget() {
  const { groups, markGroupRead } = useTransactionNotifications();
  const location = useLocation();
  const [expanded, setExpanded] = useState(() => new Set());
  const groupRefs = useRef({});

  const highlightKey = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get('notifyGroup');
  }, [location.search]);

  useEffect(() => {
    if (!highlightKey) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(highlightKey);
      return next;
    });
    const target = groupRefs.current[highlightKey];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightKey]);

  const toggleExpanded = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <h3 style={styles.title}>Transaction Notifications</h3>
        <span style={styles.subtitle}>Grouped by transaction name</span>
      </div>
      {groups.length === 0 && (
        <div style={styles.empty}>No transaction notifications yet.</div>
      )}
      <div style={styles.list}>
        {groups.map((group) => {
          const isExpanded = expanded.has(group.key);
          const isHighlighted = group.key === highlightKey;
          return (
            <div
              key={group.key}
              style={styles.group(isHighlighted)}
              ref={(node) => {
                groupRefs.current[group.key] = node;
              }}
            >
              <div style={styles.groupHeader}>
                <button
                  type="button"
                  style={styles.groupToggle}
                  onClick={() => toggleExpanded(group.key)}
                >
                  <span style={styles.groupName}>{group.name}</span>
                  <span style={styles.groupCount}>
                    {group.unreadCount > 0
                      ? `${group.unreadCount} unread`
                      : `${group.items.length} total`}
                  </span>
                </button>
                {group.unreadCount > 0 && (
                  <button
                    type="button"
                    style={styles.markRead}
                    onClick={() => markGroupRead(group.key)}
                  >
                    Mark read
                  </button>
                )}
              </div>
              {isExpanded && (
                <div style={styles.items}>
                  {group.items.map((item) => (
                    <div key={item.id} style={styles.item(item.isRead)}>
                      <div style={styles.itemSummary}>
                        <span style={styles.itemAction}>{formatActionLabel(item.action)}</span>
                        <span>{item.summaryText || 'Transaction update'}</span>
                      </div>
                      {Array.isArray(item.summaryFields) && item.summaryFields.length > 0 && (
                        <div style={styles.summaryFields}>
                          {item.summaryFields.map((field) => (
                            <div key={`${item.id}-${field.field}`} style={styles.summaryFieldRow}>
                              <span style={styles.summaryFieldLabel}>{field.field}</span>
                              <span style={styles.summaryFieldValue}>{field.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={styles.itemMeta}>
                        {formatTimestamp(item.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const styles = {
  section: {
    background: '#fff',
    borderRadius: '12px',
    padding: '1rem',
    boxShadow: '0 6px 20px rgba(15,23,42,0.08)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  title: { margin: 0, fontSize: '1rem', color: '#0f172a' },
  subtitle: { fontSize: '0.75rem', color: '#64748b' },
  empty: { color: '#64748b', padding: '0.75rem 0' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  group: (highlighted) => ({
    border: highlighted ? '2px solid #2563eb' : '1px solid #e5e7eb',
    borderRadius: '10px',
    background: highlighted ? '#eff6ff' : '#fff',
    padding: '0.75rem',
  }),
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  groupToggle: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    flexGrow: 1,
  },
  groupName: { display: 'block', fontWeight: 600, color: '#0f172a' },
  groupCount: { display: 'block', fontSize: '0.75rem', color: '#64748b' },
  markRead: {
    background: '#e2e8f0',
    border: 'none',
    borderRadius: '999px',
    padding: '0.35rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  items: { marginTop: '0.75rem', display: 'grid', gap: '0.5rem' },
  item: (isRead) => ({
    background: isRead ? '#f8fafc' : '#e0f2fe',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
  }),
  itemSummary: {
    fontSize: '0.85rem',
    color: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  itemAction: {
    background: '#1d4ed8',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.15rem 0.5rem',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  summaryFields: {
    marginTop: '0.35rem',
    display: 'grid',
    gap: '0.25rem',
  },
  summaryFieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: '#475569',
  },
  summaryFieldLabel: { fontWeight: 600 },
  summaryFieldValue: { color: '#0f172a' },
  itemMeta: { fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' },
};

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTransactionNotifications } from '../context/TransactionNotificationContext.jsx';

function formatTimestamp(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
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
                  <span style={styles.groupName}>
                    {group.unreadCount > 0 && <span style={styles.dotInline} />}
                    {group.name}
                  </span>
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
                        {item.summaryText || 'New transaction update'}
                      </div>
                      {item.summaryFields?.length > 0 && (
                        <div style={styles.fieldList}>
                          {item.summaryFields.map((field) => (
                            <div key={field.field} style={styles.fieldRow}>
                              <span style={styles.fieldName}>{field.field}:</span>{' '}
                              <span style={styles.fieldValue}>{field.value}</span>
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
  dotInline: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: '#22c55e',
    marginRight: '0.4rem',
  },
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
  itemSummary: { fontSize: '0.85rem', color: '#1e293b' },
  fieldList: {
    marginTop: '0.35rem',
    fontSize: '0.75rem',
    color: '#475569',
    display: 'grid',
    gap: '0.2rem',
  },
  fieldRow: {
    display: 'flex',
    gap: '0.25rem',
    flexWrap: 'wrap',
  },
  fieldName: { fontWeight: 600 },
  fieldValue: { color: '#1f2937' },
  itemMeta: { fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' },
};

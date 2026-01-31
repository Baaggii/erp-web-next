import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function getActionMeta(action) {
  const label = formatActionLabel(action);
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (normalized === 'deleted' || normalized === 'delete') {
    return { label, accent: '#dc2626', background: '#fee2e2', text: '#7f1d1d' };
  }
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return { label, accent: '#2563eb', background: '#dbeafe', text: '#1e3a8a' };
  }
  if (normalized === 'changed' || normalized === 'change') {
    return { label, accent: '#d97706', background: '#fef3c7', text: '#92400e' };
  }
  return { label, accent: '#059669', background: '#d1fae5', text: '#065f46' };
}

function isDeletedAction(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  return normalized === 'deleted' || normalized === 'delete';
}

function buildSummaryText(item) {
  if (!item) return 'Transaction update';
  const actionMeta = getActionMeta(item.action);
  const normalized = typeof item.action === 'string' ? item.action.trim().toLowerCase() : '';
  if (item.summaryText) return item.summaryText;
  if (Array.isArray(item.summaryFields) && item.summaryFields.length > 0) {
    const fields = item.summaryFields
      .map((field) => field?.field)
      .filter(Boolean)
      .join(', ');
    if (fields) {
      if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
        return `Edited fields: ${fields}`;
      }
      if (normalized === 'changed' || normalized === 'change') {
        return `Changed fields: ${fields}`;
      }
    }
  }
  if (normalized === 'deleted' || normalized === 'delete') {
    return 'Transaction deleted';
  }
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return 'Transaction edited';
  }
  return `${actionMeta.label} transaction`;
}

function getActorLabel(item) {
  if (!item) return 'Unknown user';
  const actor = item.actor || item.createdBy || item.updatedBy;
  if (!actor) return 'Unknown user';
  return actor;
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

  const groupItems = useCallback((items = []) => {
    const activeItems = items.filter((item) => !isDeletedAction(item?.action));
    const deletedItems = items.filter((item) => isDeletedAction(item?.action));
    return { activeItems, deletedItems };
  }, []);

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

  const renderGroup = (group) => {
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
            {(() => {
              const { activeItems, deletedItems } = groupItems(group.items);
              const renderItems = (items) =>
                items.map((item) => {
                  const actionMeta = getActionMeta(item.action);
                  const actorLabel = getActorLabel(item);
                  return (
                    <div key={item.id} style={styles.item(item.isRead, actionMeta.accent)}>
                      <div style={styles.itemSummary}>
                        <span style={styles.itemAction(actionMeta)}>
                          {actionMeta.label}
                        </span>
                        <span>{buildSummaryText(item)}</span>
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
                        <span>By {actorLabel}</span>
                        <span style={styles.itemMetaSeparator}>•</span>
                        <span>{formatTimestamp(item.updatedAt || item.createdAt)}</span>
                      </div>
                    </div>
                  );
                });

              return (
                <>
                  <div style={styles.itemGroup}>
                    <div style={styles.itemGroupHeader}>
                      <span style={styles.itemGroupTitle}>Active</span>
                      <span style={styles.itemGroupCount}>{activeItems.length}</span>
                    </div>
                    {activeItems.length === 0 && (
                      <div style={styles.itemGroupEmpty}>No active transaction alerts.</div>
                    )}
                    {renderItems(activeItems)}
                  </div>
                  <div style={styles.itemGroup}>
                    <div style={styles.itemGroupHeader}>
                      <span style={styles.itemGroupTitle}>Deleted</span>
                      <span style={styles.itemGroupCount}>{deletedItems.length}</span>
                    </div>
                    {deletedItems.length === 0 && (
                      <div style={styles.itemGroupEmpty}>No deleted transaction alerts.</div>
                    )}
                    {renderItems(deletedItems)}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    );
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
      {groups.length > 0 && (
        <div style={styles.list}>
          {groups.map((group) => renderGroup(group))}
        </div>
      )}
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
  items: { marginTop: '0.75rem', display: 'grid', gap: '0.75rem' },
  itemGroup: {
    display: 'grid',
    gap: '0.5rem',
    padding: '0.5rem',
    borderRadius: '10px',
    background: '#f8fafc',
  },
  itemGroupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#64748b',
  },
  itemGroupTitle: { fontWeight: 600 },
  itemGroupCount: {
    background: '#e2e8f0',
    borderRadius: '999px',
    padding: '0.1rem 0.45rem',
    fontSize: '0.65rem',
    color: '#1e293b',
  },
  itemGroupEmpty: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    padding: '0.1rem 0.25rem',
  },
  item: (isRead, accent) => ({
    background: isRead ? '#f8fafc' : '#e0f2fe',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
    borderLeft: `4px solid ${accent || '#2563eb'}`,
  }),
  itemSummary: {
    fontSize: '0.85rem',
    color: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  itemAction: (meta) => ({
    background: meta?.background || '#1d4ed8',
    color: meta?.text || '#fff',
    borderRadius: '999px',
    padding: '0.15rem 0.5rem',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  }),
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
  itemMeta: {
    fontSize: '0.7rem',
    color: '#64748b',
    marginTop: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  itemMetaSeparator: { margin: '0 0.35rem' },
};

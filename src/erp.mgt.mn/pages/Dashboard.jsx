import React, { useEffect, useContext, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MosaicLayout from '../components/MosaicLayout.jsx';
import I18nContext from '../context/I18nContext.jsx';
import useDynamicTransactionNotifications from '../hooks/useDynamicTransactionNotifications.js';
import formatTimestamp from '../utils/formatTimestamp.js';

const initialLayout = {
  direction: 'row',
  first: 'dashboard',
  second: {
    direction: 'row',
    first: 'inventory',
    second: {
      direction: 'column',
      first: 'orders',
      second: 'acct',
      splitPercentage: 60,
    },
    splitPercentage: 60,
  },
  splitPercentage: 25,
};

export default function Dashboard() {
  const { t } = useContext(I18nContext);
  const [searchParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState(null);
  const highlightRefs = useRef(new Map());
  const {
    notifications,
    unreadCount,
  } = useDynamicTransactionNotifications({ limit: 40 });

  const groupedNotifications = useMemo(() => {
    const groups = new Map();
    notifications.forEach((notification) => {
      const key =
        notification.transactionName ||
        t('notifications_unknown_type', 'Other transaction');
      if (!groups.has(key)) {
        groups.set(key, {
          name: key,
          entries: [],
          latest: 0,
          unread: 0,
        });
      }
      const group = groups.get(key);
      const createdAt = new Date(notification.createdAt).getTime();
      group.entries.push(notification);
      group.latest = Math.max(group.latest, Number.isFinite(createdAt) ? createdAt : 0);
      if (!notification.isRead) group.unread += 1;
    });
    return Array.from(groups.values()).sort((a, b) => b.latest - a.latest);
  }, [notifications, t]);

  useEffect(() => {
    if (window.erpDebug) console.warn('Mounted: Dashboard');
  }, []);

  useEffect(() => {
    const raw = searchParams.get('highlightNotification');
    if (!raw) return;
    setHighlightId(raw);
  }, [searchParams]);

  useEffect(() => {
    if (!highlightId) return;
    const node = highlightRefs.current.get(highlightId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timer = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightId, notifications]);

  return (
    <div>
      <h2>{t('dashboard', 'Dashboard')}</h2>
      <section style={styles.notificationsPanel}>
        <div style={styles.notificationsHeader}>
          <div>
            <h3 style={styles.notificationsTitle}>
              {t('notifications_dynamic_transactions', 'Dynamic transaction notifications')}
            </h3>
            <p style={styles.notificationsSubtitle}>
              {t(
                'notifications_dynamic_summary',
                '{{count}} total · {{unread}} unread',
                { count: notifications.length, unread: unreadCount },
              )}
            </p>
          </div>
        </div>
        {groupedNotifications.length === 0 ? (
          <p style={styles.notificationsEmpty}>
            {t('notifications_none', 'No notifications')}
          </p>
        ) : (
          groupedNotifications.map((group) => (
            <div key={group.name} style={styles.notificationGroup}>
              <div style={styles.groupHeader}>
                <span style={styles.groupTitle}>{group.name}</span>
                {group.unread > 0 && (
                  <span style={styles.groupBadge}>
                    {t('notifications_new_count', '{{count}} new', {
                      count: group.unread,
                    })}
                  </span>
                )}
              </div>
              <div style={styles.groupEntries}>
                {group.entries.map((entry) => {
                  const refKey = String(entry.id);
                  return (
                    <div
                      key={entry.id}
                      ref={(node) => {
                        if (node) {
                          highlightRefs.current.set(refKey, node);
                        } else {
                          highlightRefs.current.delete(refKey);
                        }
                      }}
                      style={{
                        ...styles.groupEntry,
                        ...(entry.isRead ? {} : styles.groupEntryUnread),
                        ...(highlightId === refKey ? styles.groupEntryHighlight : {}),
                      }}
                    >
                      <div style={styles.groupEntrySummary}>{entry.summary}</div>
                      <div style={styles.groupEntryMeta}>
                        {formatTimestamp(entry.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
      <MosaicLayout initialLayout={initialLayout} />
    </div>
  );
}

const styles = {
  notificationsPanel: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '1rem 1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)',
  },
  notificationsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
  },
  notificationsTitle: {
    margin: 0,
    fontSize: '1.05rem',
  },
  notificationsSubtitle: {
    margin: '0.25rem 0 0',
    color: '#6b7280',
    fontSize: '0.85rem',
  },
  notificationsEmpty: {
    margin: 0,
    color: '#6b7280',
    fontSize: '0.9rem',
  },
  notificationGroup: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: '0.85rem',
    marginTop: '0.85rem',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
  },
  groupTitle: {
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  groupBadge: {
    backgroundColor: '#2563eb',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.5rem',
    fontSize: '0.7rem',
  },
  groupEntries: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  groupEntry: {
    borderRadius: '8px',
    padding: '0.65rem 0.75rem',
    border: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  groupEntryUnread: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  groupEntryHighlight: {
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.4)',
  },
  groupEntrySummary: {
    fontSize: '0.85rem',
    color: '#111827',
  },
  groupEntryMeta: {
    marginTop: '0.2rem',
    fontSize: '0.72rem',
    color: '#6b7280',
  },
};

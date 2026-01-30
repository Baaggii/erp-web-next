import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useTransactionNotifications from '../hooks/useTransactionNotifications.js';
import formatTimestamp from '../utils/formatTimestamp.js';

const EMPTY_STATE = 'No notifications';

export function TransactionNotificationDropdown() {
  const { grouped, unreadCount, markRead } = useTransactionNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const hasUnread = unreadCount > 0;

  const handleNavigate = async (group) => {
    await markRead(group.entries.map((entry) => entry.id));
    setOpen(false);
    navigate('/dashboard', { state: { highlightNotificationGroup: group.key } });
  };

  return (
    <div style={styles.wrapper}>
      <button
        type="button"
        style={styles.button}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span style={styles.icon}>🔔</span>
        {hasUnread && <span style={styles.badge}>{unreadCount}</span>}
      </button>
      {open && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>Notifications</div>
          {grouped.length === 0 ? (
            <div style={styles.empty}>{EMPTY_STATE}</div>
          ) : (
            <ul style={styles.list}>
              {grouped.map((group) => (
                <li key={group.key} style={styles.group}>
                  <button
                    type="button"
                    style={styles.groupHeader}
                    onClick={() => handleNavigate(group)}
                  >
                    <span>{group.transactionName}</span>
                    <span style={styles.groupMeta}>
                      {group.unread > 0 && (
                        <span style={styles.groupUnread}>{group.unread} new</span>
                      )}
                      <span>{formatTimestamp(group.entries[0]?.createdAt)}</span>
                    </span>
                  </button>
                  <div style={styles.groupEntries}>
                    {group.entries.slice(0, 3).map((entry) => (
                      <div key={entry.id} style={styles.entry}>
                        <div style={styles.entrySummary}>{entry.summary}</div>
                        <div style={styles.entryTime}>{formatTimestamp(entry.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TransactionNotificationPanel({ highlightGroup }) {
  const { grouped, markRead } = useTransactionNotifications({ limit: 100 });

  const groups = useMemo(() => grouped, [grouped]);

  if (groups.length === 0) {
    return <p style={styles.emptyPanel}>{EMPTY_STATE}</p>;
  }

  return (
    <div style={styles.panel}>
      {groups.map((group) => (
        <div
          key={group.key}
          style={{
            ...styles.panelGroup,
            ...(highlightGroup === group.key ? styles.panelHighlight : {}),
          }}
        >
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelTitle}>{group.transactionName}</div>
              <div style={styles.panelSub}>Recent updates</div>
            </div>
            <button
              type="button"
              style={styles.markReadButton}
              onClick={() => markRead(group.entries.map((entry) => entry.id))}
            >
              Mark read
            </button>
          </div>
          <ul style={styles.panelList}>
            {group.entries.map((entry) => (
              <li key={entry.id} style={styles.panelEntry}>
                <div>
                  <div style={styles.panelSummary}>{entry.summary}</div>
                  <div style={styles.panelMeta}>{formatTimestamp(entry.createdAt)}</div>
                </div>
                {!entry.isRead && <span style={styles.panelUnread}>New</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const styles = {
  wrapper: {
    position: 'relative',
    marginLeft: '0.5rem',
  },
  button: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1rem',
    position: 'relative',
  },
  icon: {
    fontSize: '1.2rem',
  },
  badge: {
    position: 'absolute',
    top: '-0.3rem',
    right: '-0.4rem',
    background: '#ef4444',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.4rem',
    fontSize: '0.65rem',
    fontWeight: 600,
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '2rem',
    width: '320px',
    background: '#fff',
    color: '#111827',
    borderRadius: '0.75rem',
    boxShadow: '0 12px 30px rgba(0,0,0,0.15)',
    zIndex: 2000,
  },
  dropdownHeader: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 600,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    maxHeight: '360px',
    overflowY: 'auto',
  },
  group: {
    borderBottom: '1px solid #f3f4f6',
    padding: '0.5rem 0',
  },
  groupHeader: {
    background: 'transparent',
    border: 'none',
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.4rem 1rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  groupMeta: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: '#6b7280',
    alignItems: 'center',
  },
  groupUnread: {
    background: '#2563eb',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.4rem',
    fontSize: '0.65rem',
  },
  groupEntries: {
    padding: '0 1rem 0.6rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  entry: {
    fontSize: '0.8rem',
  },
  entrySummary: {
    fontWeight: 500,
  },
  entryTime: {
    color: '#6b7280',
    fontSize: '0.7rem',
  },
  empty: {
    padding: '1rem',
    color: '#6b7280',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  panelGroup: {
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
    padding: '1rem',
    background: '#fff',
  },
  panelHighlight: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  panelTitle: {
    fontWeight: 600,
  },
  panelSub: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  markReadButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '0.35rem 0.75rem',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  panelList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  panelEntry: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #f3f4f6',
  },
  panelSummary: {
    fontWeight: 500,
  },
  panelMeta: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  panelUnread: {
    background: '#2563eb',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.4rem',
    fontSize: '0.65rem',
  },
  emptyPanel: {
    color: '#6b7280',
    margin: 0,
  },
};

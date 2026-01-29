import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import PendingRequestWidget from '../components/PendingRequestWidget.jsx';
import OutgoingRequestWidget from '../components/OutgoingRequestWidget.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import { useTour } from '../components/ERPLayout.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

export default function DashboardPage() {
  const { user, session } = useContext(AuthContext);
  const { hasNew, markSeen, outgoing } = usePendingRequests();
  const { t } = useContext(LangContext);
  const location = useLocation();
  const [active, setActive] = useState('general');
  const [transactionNotifications, setTransactionNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [highlightLabel, setHighlightLabel] = useState('');
  useTour('dashboard');

  const prevTab = useRef('general');
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const highlight = params.get('highlight') || '';
    if (tab) {
      setActive(tab);
    }
    setHighlightLabel(highlight);
  }, [location.search]);

  useEffect(() => {
    let isActive = true;
    const loadNotifications = async () => {
      setNotificationsLoading(true);
      setNotificationsError('');
      try {
        const res = await fetch('/api/notifications?limit=100', {
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error('Failed to load notifications');
        }
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.notifications) ? data.notifications : [];
        if (isActive) {
          setTransactionNotifications(rows);
        }
      } catch (err) {
        if (isActive) {
          setNotificationsError(err.message || 'Failed to load notifications');
        }
      } finally {
        if (isActive) {
          setNotificationsLoading(false);
        }
      }
    };
    loadNotifications();
    return () => {
      isActive = false;
    };
  }, []);
  useEffect(() => {
    if (prevTab.current === 'audition' && active !== 'audition') {
      markSeen();
    }
    prevTab.current = active;
  }, [active, markSeen]);

  useEffect(() => () => {
    if (prevTab.current === 'audition') markSeen();
  }, [markSeen]);

  const dotBadgeStyle = {
    background: 'red',
    borderRadius: '50%',
    width: '8px',
    height: '8px',
    display: 'inline-block',
    marginRight: '4px',
  };
  const numBadgeStyle = {
    display: 'inline-block',
    background: 'red',
    color: 'white',
    borderRadius: '999px',
    padding: '0 0.4rem',
    fontSize: '0.75rem',
    marginRight: '4px',
  };

  const tabButton = (key, label, badgeCount = 0, showDot = false) => (
    <button
      key={key}
      onClick={() => setActive(key)}
      style={{
        padding: '0.5rem 1rem',
        border: 'none',
        borderBottom: active === key ? '2px solid #2563eb' : '2px solid transparent',
        background: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {badgeCount > 0 ? (
        <span style={numBadgeStyle}>{badgeCount}</span>
      ) : (
        showDot && <span style={dotBadgeStyle} />
      )}
      {label}
    </button>
  );

  const cardStyle = {
    background: '#f0f4ff',
    padding: '1rem',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    minWidth: '140px',
  };

  const notificationUnreadCount = useMemo(
    () => transactionNotifications.filter((entry) => !entry.isRead).length,
    [transactionNotifications],
  );

  const groupedNotifications = useMemo(() => {
    const map = new Map();
    transactionNotifications.forEach((entry) => {
      const label = entry.transactionName || t('notifications_unknown_type', 'Other transactions');
      const createdAt = entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
      const current = map.get(label) || {
        label,
        entries: [],
        latest: 0,
        unreadCount: 0,
      };
      current.entries.push(entry);
      current.latest = Math.max(current.latest, createdAt);
      if (!entry.isRead) current.unreadCount += 1;
      map.set(label, current);
    });
    return Array.from(map.values()).sort((a, b) => b.latest - a.latest);
  }, [t, transactionNotifications]);

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '1rem' }}>
        {tabButton('general', t('general', 'General'))}
        {tabButton('activity', t('activity', 'Activity'))}
        {tabButton(
          'audition',
          t('audition', 'Audition'),
          outgoing.accepted.newCount + outgoing.declined.newCount,
          hasNew,
        )}
        {tabButton(
          'notifications',
          t('notifications', 'Notifications'),
          notificationUnreadCount,
        )}
        {tabButton('plans', t('plans', 'Plans'))}
      </div>

      {active === 'general' && (
        <div>
          <h2 style={{ marginTop: 0 }}>
            {t('welcome', 'Welcome')}, {user?.full_name || user?.username}
            {session && ` (${session.company_name})`}
          </h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>
                {t('todays_income', "Today's Income")}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>$0</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>
                {t('low_stock', 'Low Stock')}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0 items</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>
                {t('new_orders', 'New Orders')}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0</div>
            </div>
          </div>
        </div>
      )}

      {active === 'activity' && (
        <div>
          <p>{t('no_activity', 'No activity to display.')}</p>
        </div>
      )}

      {active === 'audition' && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ ...cardStyle, flex: '1 1 300px' }}>
            <PendingRequestWidget />
          </div>
          <div style={{ ...cardStyle, flex: '1 1 300px' }}>
            <OutgoingRequestWidget />
          </div>
        </div>
      )}

      {active === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {notificationsLoading && (
            <p>{t('loading', 'Loading')}...</p>
          )}
          {notificationsError && (
            <p style={{ color: '#b91c1c' }}>{notificationsError}</p>
          )}
          {!notificationsLoading && !notificationsError && groupedNotifications.length === 0 && (
            <p>{t('notifications_none', 'No notifications')}</p>
          )}
          {!notificationsLoading && !notificationsError && groupedNotifications.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {groupedNotifications.map((group) => {
                const highlight = highlightLabel && group.label === highlightLabel;
                const latestEntry = group.entries[0];
                return (
                  <div
                    key={group.label}
                    style={{
                      ...cardStyle,
                      flex: '1 1 260px',
                      border: highlight ? '2px solid #2563eb' : '1px solid #e5e7eb',
                      background: highlight ? '#eff6ff' : '#f9fafb',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <strong>{group.label}</strong>
                      {group.unreadCount > 0 && (
                        <span
                          style={{
                            background: '#2563eb',
                            color: '#fff',
                            padding: '0.1rem 0.5rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                          }}
                        >
                          {group.unreadCount}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '0.5rem 0 0.25rem', color: '#4b5563' }}>
                      {latestEntry?.message || t('notifications_summary', 'Recent activity')}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
                      {latestEntry?.createdAt
                        ? formatTimestamp(latestEntry.createdAt)
                        : t('notifications_unknown_date', 'Unknown date')}
                    </p>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                      {t('notifications_group_count', 'Count')}: {group.entries.length}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {active === 'plans' && (
        <div>
          <p>{t('plans_coming_soon', 'Plans content coming soon.')}</p>
        </div>
      )}
    </div>
  );
}

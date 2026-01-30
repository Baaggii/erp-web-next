import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import PendingRequestWidget from '../components/PendingRequestWidget.jsx';
import OutgoingRequestWidget from '../components/OutgoingRequestWidget.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import { useTour } from '../components/ERPLayout.jsx';
import useTransactionNotifications from '../hooks/useTransactionNotifications.js';
import formatTimestamp from '../utils/formatTimestamp.js';

export default function DashboardPage() {
  const { user, session } = useContext(AuthContext);
  const { hasNew, markSeen, outgoing } = usePendingRequests();
  const { t } = useContext(LangContext);
  const [active, setActive] = useState('general');
  const location = useLocation();
  const { entries: transactionNotifications, unreadCount: transactionUnreadCount } =
    useTransactionNotifications({ limit: 50 });
  useTour('dashboard');

  const prevTab = useRef('general');
  useEffect(() => {
    if (prevTab.current === 'audition' && active !== 'audition') {
      markSeen();
    }
    prevTab.current = active;
  }, [active, markSeen]);

  useEffect(() => () => {
    if (prevTab.current === 'audition') markSeen();
  }, [markSeen]);

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const requestedTab = searchParams.get('tab');
  const focusGroup = searchParams.get('focus');

  useEffect(() => {
    if (requestedTab) {
      setActive(requestedTab);
    }
  }, [requestedTab]);

  const groupedNotifications = useMemo(() => {
    const groups = new Map();
    transactionNotifications.forEach((entry) => {
      const groupKey =
        entry.transactionName || t('notifications_unknown_type', 'Other transaction');
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          entries: [],
          latest: 0,
        });
      }
      const ts = new Date(entry.createdAt || entry.created_at || 0).getTime();
      const group = groups.get(groupKey);
      group.entries.push(entry);
      group.latest = Math.max(group.latest, Number.isFinite(ts) ? ts : 0);
    });
    return Array.from(groups.values()).sort((a, b) => b.latest - a.latest);
  }, [transactionNotifications, t]);

  const groupRefs = useRef({});
  useEffect(() => {
    if (!focusGroup) return;
    const target = groupRefs.current[focusGroup.toLowerCase()];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusGroup, groupedNotifications]);

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
  const formatNotificationTime = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return t('notifications_unknown_date', 'Unknown date');
    }
    return formatTimestamp(date);
  };

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
          transactionUnreadCount,
          transactionUnreadCount > 0,
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

      {active === 'plans' && (
        <div>
          <p>{t('plans_coming_soon', 'Plans content coming soon.')}</p>
        </div>
      )}

      {active === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {groupedNotifications.length === 0 ? (
            <p>{t('notifications_none', 'No notifications')}</p>
          ) : (
            groupedNotifications.map((group) => {
              const isHighlighted =
                focusGroup && group.key.toLowerCase() === focusGroup.toLowerCase();
              return (
                <div
                  key={group.key}
                  ref={(node) => {
                    if (node) {
                      groupRefs.current[group.key.toLowerCase()] = node;
                    }
                  }}
                  style={{
                    ...cardStyle,
                    border: isHighlighted ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: isHighlighted ? '#eff6ff' : '#fff',
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>{group.key}</h3>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                    {group.entries.map((entry) => (
                      <li key={entry.notification_id} style={{ marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 600 }}>
                          {entry.summary ||
                            t('notifications_unknown_type', 'Other transaction')}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          {formatNotificationTime(entry.createdAt || entry.created_at)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

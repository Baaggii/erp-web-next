import React, { useContext, useState, useEffect, useRef } from 'react';
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
  const [notificationSummary, setNotificationSummary] = useState({
    loading: true,
    error: '',
    groups: [],
    unreadTotal: 0,
  });
  const [highlightNotifications, setHighlightNotifications] = useState(false);
  const [highlightTransaction, setHighlightTransaction] = useState('');
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

  useEffect(() => {
    let isMounted = true;
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/notifications/summary', {
          credentials: 'include',
          skipLoader: true,
        });
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const data = await res.json().catch(() => ({}));
        if (!isMounted) return;
        setNotificationSummary({
          loading: false,
          error: '',
          groups: Array.isArray(data?.groups) ? data.groups : [],
          unreadTotal: Number(data?.unreadTotal) || 0,
        });
      } catch (err) {
        if (!isMounted) return;
        setNotificationSummary((prev) => ({
          ...prev,
          loading: false,
          error: t('notifications_load_error', 'Unable to load notifications'),
        }));
      }
    };
    fetchSummary();
    return () => {
      isMounted = false;
    };
  }, [t]);

  useEffect(() => {
    const highlight = location.state?.highlightNotifications;
    if (highlight) {
      setActive('notifications');
      setHighlightNotifications(true);
      setHighlightTransaction(location.state?.highlightTransaction || '');
      const timeout = setTimeout(() => setHighlightNotifications(false), 2500);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [location.state]);

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
          notificationSummary.unreadTotal,
          notificationSummary.unreadTotal > 0,
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            padding: '0.5rem',
            borderRadius: '8px',
            border: highlightNotifications ? '2px solid #2563eb' : '1px solid #e5e7eb',
            background: highlightNotifications ? '#eff6ff' : '#fff',
          }}
        >
          {notificationSummary.loading && (
            <p style={{ margin: 0 }}>{t('notifications_loading', 'Loading notifications...')}</p>
          )}
          {!notificationSummary.loading && notificationSummary.error && (
            <p style={{ margin: 0, color: '#b91c1c' }}>{notificationSummary.error}</p>
          )}
          {!notificationSummary.loading &&
            !notificationSummary.error &&
            notificationSummary.groups.length === 0 && (
              <p style={{ margin: 0 }}>{t('notifications_none', 'No notifications')}</p>
            )}
          {!notificationSummary.loading &&
            !notificationSummary.error &&
            notificationSummary.groups.map((group) => {
              const isHighlighted =
                highlightNotifications &&
                highlightTransaction &&
                group.name === highlightTransaction;
              return (
                <div
                  key={group.key}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: isHighlighted ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: isHighlighted ? '#dbeafe' : '#f9fafb',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{group.name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.25rem' }}>
                    {t('notifications_group_count', 'Count')}: {group.count}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.15rem' }}>
                    {t('notifications_unread', 'Unread')}: {group.unreadCount}
                  </div>
                  {group.latestAt && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {t('notifications_latest', 'Latest')}: {formatTimestamp(group.latestAt)}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

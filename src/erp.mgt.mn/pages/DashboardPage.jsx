import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import PendingRequestWidget from '../components/PendingRequestWidget.jsx';
import OutgoingRequestWidget from '../components/OutgoingRequestWidget.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import { useTour } from '../components/ERPLayout.jsx';
import useDynamicNotifications from '../hooks/useDynamicNotifications.js';
import formatTimestamp from '../utils/formatTimestamp.js';

export default function DashboardPage() {
  const { user, session } = useContext(AuthContext);
  const { hasNew, markSeen, outgoing } = usePendingRequests();
  const { t } = useContext(LangContext);
  const [active, setActive] = useState('general');
  const location = useLocation();
  const { notifications: dynamicNotifications } = useDynamicNotifications();
  useTour('dashboard');

  const highlightGroup = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('highlight') !== 'notifications') return null;
    return params.get('group');
  }, [location.search]);

  const groupedNotifications = useMemo(() => {
    const groups = new Map();
    dynamicNotifications.forEach((item) => {
      const message = item.message || {};
      const key = message.transactionName || message.transactionTable || 'Transactions';
      if (!groups.has(key)) {
        groups.set(key, { key, latest: 0, entries: [] });
      }
      const created = new Date(item.createdAt || 0).getTime();
      const group = groups.get(key);
      group.entries.push(item);
      if (created > group.latest) group.latest = created;
    });
    return Array.from(groups.values())
      .sort((a, b) => b.latest - a.latest)
      .map((group) => ({
        ...group,
        entries: group.entries.sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        ),
      }));
  }, [dynamicNotifications]);

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
        {tabButton('plans', t('plans', 'Plans'))}
      </div>

      {active === 'general' && (
        <div>
          <h2 style={{ marginTop: 0 }}>
            {t('welcome', 'Welcome')}, {user?.full_name || user?.username}
            {session && ` (${session.company_name})`}
          </h2>
          <div style={{ margin: '1.5rem 0' }}>
            <h3>{t('notifications', 'Notifications')}</h3>
            {groupedNotifications.length === 0 ? (
              <p style={{ color: '#6b7280' }}>
                {t('notifications_none', 'No notifications')}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {groupedNotifications.map((group) => {
                  const latestEntry = group.entries[0];
                  const latestLabel =
                    latestEntry?.message?.summary ||
                    latestEntry?.message?.text ||
                    '';
                  const isHighlighted =
                    highlightGroup && decodeURIComponent(highlightGroup) === group.key;
                  return (
                    <div
                      key={group.key}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '0.75rem 1rem',
                        backgroundColor: isHighlighted ? '#fef9c3' : '#fff',
                        boxShadow: isHighlighted
                          ? '0 0 0 2px rgba(251, 191, 36, 0.6)'
                          : '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{group.key}</div>
                      {latestLabel && (
                        <div style={{ color: '#4b5563', marginTop: '0.25rem' }}>
                          {latestLabel}
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.8rem',
                          color: '#6b7280',
                          marginTop: '0.5rem',
                        }}
                      >
                        <span>
                          {latestEntry?.createdAt
                            ? formatTimestamp(latestEntry.createdAt)
                            : ''}
                        </span>
                        <span>{group.entries.length}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
    </div>
  );
}

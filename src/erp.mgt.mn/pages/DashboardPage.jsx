import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
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
  const {
    notifications: transactionNotifications,
    unreadCount: transactionUnread,
    loading: transactionLoading,
    error: transactionError,
    markAllRead: markAllTransactionRead,
  } = useTransactionNotifications();
  const [active, setActive] = useState('general');
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

  const transactionGroups = useMemo(() => {
    const map = new Map();
    transactionNotifications.forEach((entry) => {
      const name =
        entry?.meta?.formName ||
        entry?.meta?.form_name ||
        entry?.meta?.label ||
        entry?.meta?.table ||
        t('notifications_unknown_type', 'Other transaction');
      const key = String(name);
      if (!map.has(key)) {
        map.set(key, {
          name,
          entries: [],
          unreadCount: 0,
          latest: 0,
        });
      }
      const group = map.get(key);
      group.entries.push(entry);
      if (!entry?.is_read) group.unreadCount += 1;
      const ts = new Date(entry?.created_at || 0).getTime();
      if (Number.isFinite(ts)) group.latest = Math.max(group.latest, ts);
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ marginTop: 0 }}>
              {t('transaction_notifications', 'Transaction notifications')}
            </h3>
            <button
              type="button"
              onClick={markAllTransactionRead}
              disabled={transactionUnread === 0}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                background: transactionUnread === 0 ? '#f3f4f6' : '#fff',
                cursor: transactionUnread === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {t('notifications_mark_read', 'Mark as read')}
            </button>
          </div>
          {transactionLoading ? (
            <p>{t('loading', 'Loading')}...</p>
          ) : transactionError ? (
            <p>{t('notifications_temporary_error', 'Failed to load notifications')}</p>
          ) : transactionGroups.length === 0 ? (
            <p>{t('notifications_none', 'No notifications')}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {transactionGroups.map((group) => (
                <li
                  key={group.name}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <strong>{group.name}</strong>
                      <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                        {t('notifications_group_count', 'Count')}: {group.entries.length}
                      </div>
                      {group.latest > 0 && (
                        <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                          {t('temporary_date', 'Date')}: {formatTimestamp(group.latest)}
                        </div>
                      )}
                    </div>
                    {group.unreadCount > 0 && (
                      <span style={numBadgeStyle}>{group.unreadCount}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
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

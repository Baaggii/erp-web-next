import React, { useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import PendingRequestWidget from '../components/PendingRequestWidget.jsx';
import OutgoingRequestWidget from '../components/OutgoingRequestWidget.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import { useTour } from '../components/ERPLayout.jsx';
import { playNotificationSound } from '../utils/playNotificationSound.js';

export default function DashboardPage() {
  const { user, session, userSettings } = useContext(AuthContext);
  const { hasNew, markSeen, outgoing } = usePendingRequests();
  const { t } = useContext(LangContext);
  const [active, setActive] = useState('general');
  const [transactionNotifications, setTransactionNotifications] = useState({
    rows: [],
    loading: true,
    error: '',
  });
  const latestNotificationRef = useRef(null);
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

  const dashboardSound = useMemo(() => {
    const sound = userSettings?.dashboardNotificationSound || userSettings?.notificationSound;
    return (sound || 'chime').trim();
  }, [userSettings?.dashboardNotificationSound, userSettings?.notificationSound]);

  const notificationVolume = useMemo(() => {
    const volume = Number(userSettings?.notificationVolume);
    if (Number.isFinite(volume)) {
      return Math.max(0, Math.min(1, volume));
    }
    return 1;
  }, [userSettings?.notificationVolume]);

  const loadTransactionNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/transaction_notifications?limit=50', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to load transaction notifications');
      }
      const data = await res.json();
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setTransactionNotifications({ rows, loading: false, error: '' });
    } catch (err) {
      setTransactionNotifications((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Failed to load transaction notifications',
      }));
    }
  }, []);

  useEffect(() => {
    loadTransactionNotifications();
    const interval = setInterval(loadTransactionNotifications, 60000);
    return () => clearInterval(interval);
  }, [loadTransactionNotifications]);

  useEffect(() => {
    const latestId = transactionNotifications.rows?.[0]?.id ?? null;
    if (latestId && latestNotificationRef.current && latestId !== latestNotificationRef.current) {
      playNotificationSound(dashboardSound, notificationVolume);
    }
    latestNotificationRef.current = latestId;
  }, [transactionNotifications.rows, dashboardSound, notificationVolume]);

  const notificationGroups = useMemo(() => {
    const map = new Map();
    (transactionNotifications.rows || []).forEach((row) => {
      const name = row.transactionName || t('notifications_unknown_type', 'Other transaction');
      const current = map.get(name) || { name, count: 0, latest: null };
      current.count += 1;
      if (row.createdAt) {
        const createdAt = new Date(row.createdAt);
        if (!current.latest || createdAt > current.latest) {
          current.latest = createdAt;
        }
      }
      map.set(name, current);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [transactionNotifications.rows, t]);

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
          <section style={{ marginTop: '2rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>
              {t('transaction_notifications', 'Transaction notifications')}
            </h3>
            {transactionNotifications.loading ? (
              <p>{t('loading', 'Loading...')}</p>
            ) : transactionNotifications.error ? (
              <p style={{ color: '#b91c1c' }}>{transactionNotifications.error}</p>
            ) : notificationGroups.length === 0 ? (
              <p>{t('notifications_none', 'No notifications')}</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                {notificationGroups.map((group) => (
                  <div key={group.name} style={cardStyle}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                      {group.name}
                    </div>
                    <div style={{ marginTop: '0.25rem', color: '#555' }}>
                      {t('notifications_group_count', 'Count')}: {group.count}
                    </div>
                    {group.latest && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#6b7280' }}>
                        {t('notifications_requested_at', 'Created')}: {group.latest.toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
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

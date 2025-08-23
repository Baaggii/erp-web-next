import React, { useContext, useState, useEffect, useRef } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import PendingRequestWidget from '../components/PendingRequestWidget.jsx';
import OutgoingRequestWidget from '../components/OutgoingRequestWidget.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function DashboardPage() {
  const { user, session } = useContext(AuthContext);
  const { hasNew, markSeen, outgoing } = usePendingRequests();
  const [active, setActive] = useState('general');

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
        {tabButton('general', 'General')}
        {tabButton('activity', 'Activity')}
        {tabButton(
          'audition',
          'Audition',
          outgoing.accepted.newCount + outgoing.declined.newCount,
          hasNew,
        )}
        {tabButton('plans', 'Plans')}
      </div>

      {active === 'general' && (
        <div>
          <h2 style={{ marginTop: 0 }}>
            Welcome, {user?.full_name || user?.username}
            {session && ` (${session.company_name})`}
          </h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>Today's Income</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>$0</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>Low Stock</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0 items</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>New Orders</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0</div>
            </div>
          </div>
        </div>
      )}

      {active === 'activity' && (
        <div>
          <p>No activity to display.</p>
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
          <p>Plans content coming soon.</p>
        </div>
      )}
    </div>
  );
}


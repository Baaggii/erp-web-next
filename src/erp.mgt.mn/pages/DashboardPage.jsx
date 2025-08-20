import React, { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import PendingRequestWidget from '../components/PendingRequestWidget.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function DashboardPage() {
  const { user, session } = useContext(AuthContext);
  const { hasNew, markSeen } = usePendingRequests();
  const [active, setActive] = useState('general');
  const showActivity = Number(session?.senior_empid) <= 0;

  useEffect(() => {
    if (showActivity && active === 'activity') markSeen();
  }, [active, markSeen, showActivity]);

  const badgeStyle = {
    background: 'red',
    borderRadius: '50%',
    width: '8px',
    height: '8px',
    display: 'inline-block',
    marginRight: '4px',
  };

  const tabButton = (key, label, showBadge = false) => (
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
      {showBadge && <span style={badgeStyle} />}
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
        {showActivity && tabButton('activity', 'Activity', hasNew)}
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

      {showActivity && active === 'activity' && (
        <div>
          <PendingRequestWidget />
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


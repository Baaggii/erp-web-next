import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function OutgoingRequestWidget() {
  const navigate = useNavigate();
  const { outgoing } = usePendingRequests();

  const badgeStyle = {
    display: 'inline-block',
    backgroundColor: 'red',
    color: 'white',
    borderRadius: '50%',
    padding: '0 0.4rem',
    fontSize: '0.8rem',
    marginLeft: '0.25rem',
  };

  return (
    <div>
      <h3>Outgoing requests</h3>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Pending</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
            {outgoing.pending.count}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>
            Accepted
            {outgoing.accepted.hasNew && (
              <span style={badgeStyle}>{outgoing.accepted.newCount}</span>
            )}
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
            {outgoing.accepted.count}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>
            Declined
            {outgoing.declined.hasNew && (
              <span style={badgeStyle}>{outgoing.declined.newCount}</span>
            )}
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
            {outgoing.declined.count}
          </div>
        </div>
      </div>
      <button onClick={() => navigate('/requests?tab=outgoing')}>
        View requests
      </button>
    </div>
  );
}

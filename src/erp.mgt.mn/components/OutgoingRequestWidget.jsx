import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function OutgoingRequestWidget() {
  const navigate = useNavigate();
  const { outgoing } = usePendingRequests();
  const counts = {
    pending: outgoing.pending.count,
    accepted: outgoing.accepted.count,
    declined: outgoing.declined.count,
  };

  return (
    <div>
      <h3>Outgoing requests</h3>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Pending</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{counts.pending}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Accepted</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{counts.accepted}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Declined</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{counts.declined}</div>
        </div>
      </div>
      <button onClick={() => navigate('/requests?mine=1')}>View requests</button>
    </div>
  );
}

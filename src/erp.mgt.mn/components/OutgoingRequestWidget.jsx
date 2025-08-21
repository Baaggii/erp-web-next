import React from 'react';
import { useNavigate } from 'react-router-dom';
import useOutgoingRequestCount from '../hooks/useOutgoingRequestCount.js';

export default function OutgoingRequestWidget() {
  const navigate = useNavigate();
  const { counts, hasNew } = useOutgoingRequestCount();

  const badgeStyle = {
    display: 'inline-block',
    backgroundColor: 'red',
    color: 'white',
    borderRadius: '50%',
    padding: '0.25rem 0.5rem',
    minWidth: '1.5rem',
    textAlign: 'center',
    marginLeft: '0.5rem',
  };

  const anyNew = hasNew.pending || hasNew.accepted || hasNew.declined;

  return (
    <div>
      <h3>
        Outgoing requests
        {anyNew && <span style={badgeStyle}>!</span>}
      </h3>
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

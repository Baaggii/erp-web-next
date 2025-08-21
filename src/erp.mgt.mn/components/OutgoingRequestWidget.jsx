import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import useResponseNotifications from '../hooks/useResponseNotifications.js';

export default function OutgoingRequestWidget() {
  const navigate = useNavigate();
  const { outgoing, markSeen: markCountsSeen } = usePendingRequests();
  const {
    counts: responseCounts,
    markSeen: markResponsesSeen,
  } = useResponseNotifications();
  const counts = {
    pending: outgoing.pending.count,
    accepted: outgoing.accepted.count,
    declined: outgoing.declined.count,
  };

  function handleView() {
    markCountsSeen();
    markResponsesSeen();
    navigate('/requests?mine=1');
  }

  return (
    <div>
      <h3>Outgoing requests</h3>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Pending</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{counts.pending}</div>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Accepted</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{counts.accepted}</div>
          {responseCounts.accepted > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: 'red',
                color: '#fff',
                borderRadius: '50%',
                padding: '0 4px',
                fontSize: '0.75rem',
              }}
            >
              {responseCounts.accepted}
            </span>
          )}
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Declined</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{counts.declined}</div>
          {responseCounts.declined > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: 'red',
                color: '#fff',
                borderRadius: '50%',
                padding: '0 4px',
                fontSize: '0.75rem',
              }}
            >
              {responseCounts.declined}
            </span>
          )}
        </div>
      </div>
      <button onClick={handleView}>View requests</button>
    </div>
  );
}

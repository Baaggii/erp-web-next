import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function PendingRequestWidget() {
  const navigate = useNavigate();
  const { count } = usePendingRequests();

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

  return (
    <div>
      <h3>
        Pending Requests
        {count > 0 && <span style={badgeStyle}>{count}</span>}
      </h3>
      {count > 0 ? (
        <p>
          {count} pending request{count === 1 ? '' : 's'}
        </p>
      ) : (
        <p>No pending requests</p>
      )}
      <button onClick={() => navigate('/requests')}>View Requests</button>
    </div>
  );
}

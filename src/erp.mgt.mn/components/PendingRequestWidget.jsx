import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function PendingRequestWidget() {
  const { session } = useContext(AuthContext);
  const navigate = useNavigate();
  const isSenior = Number(session?.senior_empid) > 0;
  const { count } = usePendingRequests();

  if (!isSenior) return null;

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

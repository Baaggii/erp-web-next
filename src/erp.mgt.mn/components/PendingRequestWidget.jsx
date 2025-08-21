import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function PendingRequestWidget() {
  const { user, session } = useContext(AuthContext);
  const navigate = useNavigate();
  const seniorEmpId =
    session && user?.empid && !(Number(session.senior_empid) > 0)
      ? user.empid
      : null;
  const isSenior = Boolean(seniorEmpId);
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
        Incoming requests
        {count > 0 && <span style={badgeStyle}>{count}</span>}
      </h3>
      {count > 0 ? (
        <p>
          {count} incoming request{count === 1 ? '' : 's'}
        </p>
      ) : (
        <p>No incoming requests</p>
      )}
      <button onClick={() => navigate('/requests')}>View requests</button>
    </div>
  );
}

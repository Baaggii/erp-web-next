import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import usePendingRequestCount from '../hooks/usePendingRequestCount.js';

export default function PendingRequestWidget({ filters = {} }) {
  const { user, session } = useContext(AuthContext);
  const navigate = useNavigate();
  const seniorEmpId = !session?.senior_empid ? user?.empid : null;
  const count = usePendingRequestCount(seniorEmpId, filters);

  if (!seniorEmpId) return null;

  const badgeStyle = {
    display: 'inline-block',
    backgroundColor: 'red',
    color: 'white',
    borderRadius: '50%',
    padding: '0.25rem 0.5rem',
    minWidth: '1.5rem',
    textAlign: 'center',
  };

  return (
    <div>
      <h3>Pending Requests</h3>
      {count > 0 && <span style={badgeStyle}>{count}</span>}
      <button onClick={() => navigate('/requests')}>View Requests</button>
    </div>
  );
}

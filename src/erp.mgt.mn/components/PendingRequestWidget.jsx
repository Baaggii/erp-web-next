import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

export default function PendingRequestWidget({ filters = {} }) {
  const { user } = useContext(AuthContext);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      if (!user?.empid) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          status: 'pending',
          senior_empid: String(user.empid),
        });
        Object.entries(filters).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') params.append(k, v);
        });

        const res = await fetch(`/api/pending_request?${params.toString()}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data === 'number') {
            setCount(data);
          } else if (Array.isArray(data)) {
            setCount(data.length);
          } else {
            setCount(Number(data?.count) || 0);
          }
        } else {
          setCount(0);
        }
      } catch {
        setCount(0);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user?.empid, filters]);

  if (!user?.empid) return null;

  return (
    <div>
      <h3>Pending Requests</h3>
      {loading ? (
        <p>Loading...</p>
      ) : count > 0 ? (
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

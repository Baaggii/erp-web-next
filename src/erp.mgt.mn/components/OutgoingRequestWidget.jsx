import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

export default function OutgoingRequestWidget() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ pending: 0, accepted: 0, declined: 0 });

  useEffect(() => {
    if (!user?.empid) return;
    let cancelled = false;
    const statuses = ['pending', 'accepted', 'declined'];

    async function fetchCounts() {
      try {
        const results = await Promise.all(
          statuses.map(async (status) => {
            const params = new URLSearchParams({
              status,
              requested_empid: user.empid,
            });
            const res = await fetch(`/api/pending_request?${params.toString()}`, {
              credentials: 'include',
              skipLoader: true,
            });
            if (!res.ok) return 0;
            const data = await res.json().catch(() => 0);
            if (typeof data === 'number') return data;
            if (Array.isArray(data)) return data.length;
            return Number(data?.count) || 0;
          }),
        );
        if (!cancelled) {
          setCounts({
            pending: results[0],
            accepted: results[1],
            declined: results[2],
          });
        }
      } catch {
        if (!cancelled) {
          setCounts({ pending: 0, accepted: 0, declined: 0 });
        }
      }
    }

    fetchCounts();
    return () => {
      cancelled = true;
    };
  }, [user?.empid]);

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

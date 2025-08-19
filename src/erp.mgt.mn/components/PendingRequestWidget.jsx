import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function PendingRequestWidget() {
  const { user } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user?.empid) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/pending_request?status=pending&senior_empid=${encodeURIComponent(
          user.empid,
        )}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const data = await res.json();
        setRequests(Array.isArray(data) ? data : []);
      } else {
        setRequests([]);
      }
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user?.empid]);

  async function respond(id, status) {
    try {
      const res = await fetch(`/api/pending_request/${id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setRequests((r) => r.filter((req) => req.request_id !== id));
      }
    } catch {
      /* ignore */
    }
  }

  if (!user?.empid) return null;
  return (
    <div>
      <h3>Pending Requests</h3>
      {loading ? (
        <p>Loading...</p>
      ) : requests.length === 0 ? (
        <p>No pending requests</p>
      ) : (
        <ul>
          {requests.map((r) => (
            <li key={r.request_id} style={{ marginBottom: '0.5rem' }}>
              <div>
                {r.request_type} {r.table_name} #{r.record_id}
              </div>
              <button
                onClick={() => respond(r.request_id, 'accepted')}
                style={{ marginRight: '0.25rem' }}
              >
                Accept
              </button>
              <button onClick={() => respond(r.request_id, 'declined')}>
                Decline
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

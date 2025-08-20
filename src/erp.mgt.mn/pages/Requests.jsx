// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';

export default function RequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function computeDiff(original, proposed) {
    try {
      const mod = await import(/* @vite-ignore */ 'jsondiffpatch');
      await import(/* @vite-ignore */ 'jsondiffpatch/dist/formatters-styles/html.css');
      const delta = mod.diff(original, proposed);
      if (delta) {
        return mod.formatters.html.format(delta, original);
      }
    } catch {
      // Fallback simple diff
      if (original && proposed) {
        const changes = {};
        const keys = new Set([...Object.keys(original), ...Object.keys(proposed)]);
        for (const key of keys) {
          const before = original[key];
          const after = proposed[key];
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            changes[key] = { before, after };
          }
        }
        if (Object.keys(changes).length) {
          return `<pre>${JSON.stringify(changes, null, 2)}</pre>`;
        }
      }
    }
    return '';
  }

  useEffect(() => {
    async function load() {
      // Wait for auth context to resolve
      if (user === undefined) return;
      if (!user?.empid) {
        setLoading(false);
        return;
      }
      debugLog('Loading pending requests');
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/pending_request?status=pending&senior_empid=${encodeURIComponent(
            user.empid,
          )}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.rows || [];
        const enriched = await Promise.all(
          list.map(async (req) => {
            let original = null;
            try {
              const res2 = await fetch(
                `/api/tables/${req.table_name}/${req.record_id}`,
                { credentials: 'include' },
              );
              if (res2.ok) {
                original = await res2.json();
              } else {
                const res3 = await fetch(
                  `/api/tables/${req.table_name}?id=${encodeURIComponent(
                    req.record_id,
                  )}&perPage=1`,
                  { credentials: 'include' },
                );
                if (res3.ok) {
                  const json = await res3.json();
                  original = json.rows?.[0] || null;
                }
              }
            } catch (err) {
              console.error('Failed to fetch original record', err);
            }
            const html = await computeDiff(original, req.proposed_data);
            return {
              ...req,
              original,
              html,
              notes: '',
              response_status: null,
              error: null,
            };
          }),
        );
        setRequests(enriched);
      } catch (err) {
        console.error(err);
        setError('Failed to load requests');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  const updateNotes = (id, value) => {
    setRequests((reqs) =>
      reqs.map((r) => (r.request_id === id ? { ...r, notes: value } : r)),
    );
  };

  const respond = async (id, status) => {
    const reqItem = requests.find((r) => r.request_id === id);
    try {
      const res = await fetch(`/api/pending_request/${id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status,
          response_notes: reqItem?.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to respond');
      setRequests((reqs) =>
        reqs.map((r) =>
          r.request_id === id
            ? { ...r, response_status: status, error: null }
            : r,
        ),
      );
    } catch (err) {
      setRequests((reqs) =>
        reqs.map((r) =>
          r.request_id === id ? { ...r, error: err.message } : r,
        ),
      );
    }
  };

  if (user === undefined) return <p>Loading...</p>;
  if (!user?.empid) return <p>Login required</p>;

  return (
    <div>
      <h2>Requests</h2>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {requests.map((req) => (
        <div
          key={req.request_id}
          style={{
            border: '1px solid #ccc',
            margin: '1em 0',
            padding: '1em',
            background:
              req.response_status === 'accepted'
                ? '#e6ffed'
                : req.response_status === 'declined'
                ? '#ffe6e6'
                : 'transparent',
          }}
        >
          <h4>
            {req.table_name} #{req.record_id} ({req.request_type})
          </h4>
          {req.html ? (
            <div
              className="diff"
              dangerouslySetInnerHTML={{ __html: req.html }}
            />
          ) : (
            <pre>{JSON.stringify(req.proposed_data, null, 2)}</pre>
          )}
          {req.response_status ? (
            <p>Request {req.response_status}</p>
          ) : (
            <>
              <textarea
                placeholder="Notes (optional)"
                value={req.notes}
                onChange={(e) =>
                  updateNotes(req.request_id, e.target.value)
                }
                style={{ width: '100%', minHeight: '4em' }}
              />
              <div style={{ marginTop: '0.5em' }}>
                <button onClick={() => respond(req.request_id, 'accepted')}>
                  Accept
                </button>
                <button
                  onClick={() => respond(req.request_id, 'declined')}
                  style={{ marginLeft: '0.5em' }}
                >
                  Decline
                </button>
              </div>
            </>
          )}
          {req.error && <p style={{ color: 'red' }}>{req.error}</p>}
        </div>
      ))}
      {!loading && requests.length === 0 && <p>No pending requests.</p>}
    </div>
  );
}

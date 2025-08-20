// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect, useState, useRef } from 'react';
import { diff } from 'jsondiffpatch';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { debugLog } from '../utils/debug.js';

function renderValue(val) {
  if (typeof val === 'object' && val !== null) {
    return <pre>{JSON.stringify(val, null, 2)}</pre>;
  }
  return String(val ?? '');
}

export default function RequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // filters
  const [requestedEmpid, setRequestedEmpid] = useState('');
  const [tableName, setTableName] = useState('');
  const [status, setStatus] = useState('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const configCache = useRef({});

  useEffect(() => {
    async function load() {
      if (!user?.empid) {
        setLoading(false);
        return;
      }
      debugLog('Loading pending requests');
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          senior_empid: user.empid,
        });
        if (status) params.append('status', status);
        if (requestedEmpid) params.append('requested_empid', requestedEmpid);
        if (tableName) params.append('table_name', tableName);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        const res = await fetch(
          `${API_BASE}/pending_request?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();

        const enriched = await Promise.all(
          data.map(async (req) => {
            let original = null;
            try {
              const res2 = await fetch(
                `${API_BASE}/tables/${req.table_name}/${req.record_id}`,
                { credentials: 'include' },
              );
              if (res2.ok) {
                original = await res2.json();
              } else {
                const res3 = await fetch(
                  `${API_BASE}/tables/${req.table_name}?id=${encodeURIComponent(
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

            let cfg = configCache.current[req.table_name];
            if (!cfg) {
              try {
                const cfgRes = await fetch(
                  `${API_BASE}/display_fields?table=${req.table_name}`,
                  { credentials: 'include' },
                );
                if (cfgRes.ok) cfg = await cfgRes.json();
              } catch {
                cfg = null;
              }
              configCache.current[req.table_name] = cfg || {
                displayFields: [],
              };
            }
            cfg = cfg || { displayFields: [] };
            const visible = cfg.displayFields?.length
              ? cfg.displayFields
              : Array.from(
                  new Set([
                    ...Object.keys(original || {}),
                    ...Object.keys(req.proposed_data || {}),
                  ]),
                );

            const fields = visible.map((name) => {
              const before = original ? original[name] : undefined;
              const after = req.proposed_data ? req.proposed_data[name] : undefined;
              const isComplex =
                (before && typeof before === 'object') ||
                (after && typeof after === 'object');
              let changed = false;
              if (isComplex) {
                changed = !!diff(before, after);
              } else {
                changed = JSON.stringify(before) !== JSON.stringify(after);
              }
              return { name, before, after, changed, isComplex };
            });

            return {
              ...req,
              original,
              fields,
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
  }, [user?.empid, reloadKey, status, requestedEmpid, tableName, dateFrom, dateTo]);

  const updateNotes = (id, value) => {
    setRequests((reqs) =>
      reqs.map((r) => (r.request_id === id ? { ...r, notes: value } : r)),
    );
  };

  const respond = async (id, respStatus) => {
    const reqItem = requests.find((r) => r.request_id === id);
    try {
      const res = await fetch(`${API_BASE}/pending_request/${id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: respStatus,
          response_notes: reqItem?.notes || undefined,
          response_empid: user.empid,
          senior_empid: reqItem?.senior_empid || user.empid,
        }),
      });
      if (!res.ok) throw new Error('Failed to respond');
      const data = await res.json().catch(() => ({}));
      const messages = [];
      if (Array.isArray(data?.messages)) messages.push(...data.messages);
      if (data?.message) messages.push(data.message);
      messages.forEach((m) =>
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: m, type: 'success' },
          })
        )
      );
      window.dispatchEvent(new Event('pending-request-refresh'));
      setRequests((reqs) =>
        reqs.map((r) =>
          r.request_id === id
            ? { ...r, response_status: respStatus, error: null }
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

  if (!user?.empid) {
    return <p>Login required</p>;
  }

  return (
    <div>
      <h2>Requests</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setReloadKey((k) => k + 1);
        }}
        style={{ marginBottom: '1em' }}
      >
        <label style={{ marginRight: '0.5em' }}>
          Requester:
          <input
            value={requestedEmpid}
            onChange={(e) => setRequestedEmpid(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          />
        </label>
        <label style={{ marginRight: '0.5em' }}>
          Transaction Type:
          <input
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          />
        </label>
        <label style={{ marginRight: '0.5em' }}>
          Status:
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <label style={{ marginRight: '0.5em' }}>
          From:
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          />
        </label>
        <label style={{ marginRight: '0.5em' }}>
          To:
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          />
        </label>
        <button type="submit">Apply</button>
      </form>
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
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '0.25em' }}></th>
                {req.fields.map((f) => (
                  <th
                    key={f.name}
                    style={{ border: '1px solid #ccc', padding: '0.25em' }}
                  >
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '0.25em' }}>
                  Original
                </th>
                {req.fields.map((f) => (
                  <td
                    key={f.name}
                    style={{
                      border: '1px solid #ccc',
                      padding: '0.25em',
                      background: f.changed ? '#ffe6e6' : undefined,
                    }}
                  >
                    {renderValue(f.before)}
                  </td>
                ))}
              </tr>
              {req.request_type !== 'delete' && (
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '0.25em' }}>
                    Proposed
                  </th>
                  {req.fields.map((f) => (
                    <td
                      key={f.name}
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        background: f.changed ? '#e6ffe6' : undefined,
                      }}
                    >
                      {renderValue(f.after)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
          {req.response_status ? (
            <p>Request {req.response_status}</p>
          ) : (
            <>
              <textarea
                placeholder="Notes (optional)"
                value={req.notes}
                onChange={(e) => updateNotes(req.request_id, e.target.value)}
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


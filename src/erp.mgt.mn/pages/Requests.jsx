// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect, useState } from 'react';
import jsondiffpatch from 'jsondiffpatch';
import { useAuth } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';
import { API_BASE } from '../utils/apiBase.js';
import 'jsondiffpatch/dist/formatters-styles/html.css';

// Lazily load jsondiffpatch so the build doesn't require it and to avoid
// declaring a symbol that may already exist from a static import.  The module
// and its accompanying stylesheet are fetched only in the browser at runtime.
let jsonDiffPatch;
(async () => {
  try {
    const mod = await import('jsondiffpatch' /* @vite-ignore */);
    jsonDiffPatch = mod.default || mod;
    try {
      await import(
        'jsondiffpatch/dist/formatters-styles/html.css' /* @vite-ignore */
      );
    } catch {
      /* ignore */
    }
  } catch (err) {
    console.warn('jsondiffpatch not loaded', err);
  }
})();

export default function RequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requestedEmpid, setRequestedEmpid] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [jsonDiffPatch, setJsonDiffPatch] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import(
          /* @vite-ignore */
          'https://cdn.jsdelivr.net/npm/jsondiffpatch/dist/jsondiffpatch.esm.js'
        );
        setJsonDiffPatch(mod.default || mod);
        const linkId = 'jsondiffpatch-styles';
        if (!document.getElementById(linkId)) {
          const link = document.createElement('link');
          link.id = linkId;
          link.rel = 'stylesheet';
          link.href =
            'https://cdn.jsdelivr.net/npm/jsondiffpatch/dist/formatters-styles/html.css';
          document.head.appendChild(link);
        }
      } catch (err) {
        console.warn('jsondiffpatch not loaded', err);
      }
    })();
  }, []);

  function renderValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      return <pre style={{ margin: 0 }}>{JSON.stringify(v, null, 2)}</pre>;
    }
    return String(v);
  }

  function renderDiffTable(req) {
    const fields = req.visibleFields || [];
    const isDelete = req.request_type === 'delete';
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ccc', padding: '0.25em' }}>
              Field
            </th>
            <th style={{ border: '1px solid #ccc', padding: '0.25em' }}>
              Original
            </th>
            {!isDelete && (
              <th style={{ border: '1px solid #ccc', padding: '0.25em' }}>
                Proposed
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const before = req.original?.[f];
            const after = req.proposed_data?.[f];
            const complex =
              typeof before === 'object' || typeof after === 'object';
            let delta = null;
            let diffHtml = null;
            if (complex && jsonDiffPatch) {
              try {
                delta = jsonDiffPatch.diff(before, after);
                if (delta) {
                  diffHtml = jsonDiffPatch.formatters.html.format(
                    delta,
                    before,
                  );
                }
              } catch (err) {
                console.error('jsondiffpatch failed', err);
              }
            }
            const changed = isDelete
              ? true
              : complex
              ? jsonDiffPatch
                ? Boolean(delta)
                : JSON.stringify(before) !== JSON.stringify(after)
              : JSON.stringify(before) !== JSON.stringify(after);
            const style = changed
              ? { background: isDelete ? '#ffe6e6' : '#fff3cd' }
              : {};
            return (
              <tr key={f}>
                <td style={{ border: '1px solid #ccc', padding: '0.25em' }}>
                  {f}
                </td>
                <td
                  style={{ border: '1px solid #ccc', padding: '0.25em', ...style }}
                >
                  {renderValue(before)}
                </td>
                {!isDelete && (
                  <td
                    style={{
                      border: '1px solid #ccc',
                      padding: '0.25em',
                      ...style,
                    }}
                  >
                    {complex && diffHtml ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: diffHtml }}
                      />
                    ) : (
                      renderValue(after)
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

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
          status: statusFilter || 'pending',
          senior_empid: user.empid,
        });
        if (requestedEmpid) params.append('requested_empid', requestedEmpid);
        if (tableFilter) params.append('table_name', tableFilter);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        const res = await fetch(
          `${API_BASE}/pending_request?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const cache = {};
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
            let visibleFields = [];
            try {
              if (!cache[req.table_name]) {
                const cfgRes = await fetch(
                  `${API_BASE}/display_fields?table=${encodeURIComponent(
                    req.table_name,
                  )}`,
                  { credentials: 'include' },
                );
                cache[req.table_name] = cfgRes.ok
                  ? await cfgRes.json()
                  : null;
              }
              const cfg = cache[req.table_name];
              if (cfg && Array.isArray(cfg.displayFields)) {
                visibleFields = cfg.displayFields;
              }
            } catch (err) {
              console.error('Failed to fetch config', err);
            }
            if (!visibleFields.length) {
              visibleFields = Object.keys({
                ...(original || {}),
                ...(req.proposed_data || {}),
              });
            }
            return {
              ...req,
              original,
              visibleFields,
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
  }, [
    user?.empid,
    requestedEmpid,
    tableFilter,
    statusFilter,
    dateFrom,
    dateTo,
  ]);

  const updateNotes = (id, value) => {
    setRequests((reqs) =>
      reqs.map((r) => (r.request_id === id ? { ...r, notes: value } : r)),
    );
  };

  const respond = async (id, status) => {
    const reqItem = requests.find((r) => r.request_id === id);
    try {
      const res = await fetch(`${API_BASE}/pending_request/${id}/respond`, {
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

  if (!user?.empid) {
    return <p>Login required</p>;
  }

  return (
    <div>
      <h2>Requests</h2>
      <div style={{ marginBottom: '1em' }}>
        <label>
          Requester:
          <input
            value={requestedEmpid}
            onChange={(e) => setRequestedEmpid(e.target.value)}
            style={{ marginLeft: '0.5em' }}
          />
        </label>
        <label style={{ marginLeft: '1em' }}>
          Transaction Type:
          <input
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            style={{ marginLeft: '0.5em' }}
          />
        </label>
        <label style={{ marginLeft: '1em' }}>
          Status:
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ marginLeft: '0.5em' }}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <label style={{ marginLeft: '1em' }}>
          From:
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ marginLeft: '0.5em' }}
          />
        </label>
        <label style={{ marginLeft: '1em' }}>
          To:
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ marginLeft: '0.5em' }}
          />
        </label>
      </div>
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
          {renderDiffTable(req)}
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

// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { diff } from 'jsondiffpatch';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { debugLog } from '../utils/debug.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import { translateToMn } from '../utils/translateToMn.js';

function renderValue(val) {
  const style = { whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
  if (typeof val === 'object' && val !== null) {
    return (
      <pre style={{ ...style, margin: 0 }}>
        {JSON.stringify(val, null, 2)}
      </pre>
    );
  }
  return <span style={style}>{String(val ?? '')}</span>;
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

  const allFields = useMemo(() => {
    const set = new Set();
    requests.forEach((r) => r.fields?.forEach((f) => set.add(f.name)));
    return Array.from(set);
  }, [requests]);

  const headerMap = useHeaderMappings(allFields);
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
              if (
                res2.ok &&
                res2.headers
                  .get('content-type')
                  ?.includes('application/json')
              ) {
                original = await res2.json();
              } else {
                const res3 = await fetch(
                  `${API_BASE}/tables/${req.table_name}?id=${encodeURIComponent(
                    req.record_id,
                  )}&perPage=1`,
                  { credentials: 'include' },
                );
                if (
                  res3.ok &&
                  res3.headers
                    .get('content-type')
                    ?.includes('application/json')
                ) {
                  const json = await res3.json();
                  original = json.rows?.[0] || null;
                }
              }
            } catch (err) {
              debugLog('Failed to fetch original record', err);
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

            const fields = visible
              .map((name) => {
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
              })
              .filter((f) => {
                const emptyBefore = f.before === undefined || f.before === null || f.before === '';
                const emptyAfter = f.after === undefined || f.after === null || f.after === '';
                return !(emptyBefore && emptyAfter);
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
      if (!res.ok) {
        if (res.status === 403) throw new Error('Forbidden');
        throw new Error('Failed to respond');
      }
      setRequests((reqs) =>
        reqs.map((r) =>
          r.request_id === id
            ? {
                ...r,
                response_status: respStatus,
                status: respStatus,
                error: null,
              }
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
      {requests.map((req) => {
        const columns = req.fields.map((f) => f.name);
        const fieldMap = {};
        req.fields.forEach((f) => {
          fieldMap[f.name] = f;
        });
        const columnAlign = {};
        columns.forEach((c) => {
          const sample =
            fieldMap[c].before !== undefined && fieldMap[c].before !== null
              ? fieldMap[c].before
              : fieldMap[c].after;
          columnAlign[c] = typeof sample === 'number' ? 'right' : 'left';
        });
        const requestStatus = req.status || req.response_status;
        const requestStatusLower = requestStatus
          ? String(requestStatus).trim().toLowerCase()
          : undefined;
        const isRequester =
          String(req.emp_id).trim() === String(user.empid).trim();
        const assignedSenior =
          req.senior_empid !== undefined && req.senior_empid !== null &&
          String(req.senior_empid).trim() !== '0'
            ? String(req.senior_empid).trim()
            : null;
        const isPending =
          !requestStatusLower || requestStatusLower === 'pending';
        const canRespond =
          !isRequester &&
          isPending &&
          (!assignedSenior || assignedSenior === String(user.empid).trim());

        return (
          <div
            key={req.request_id}
            style={{
              border: '1px solid #ccc',
              margin: '1em 0',
              padding: '1em',
              background:
                requestStatus === 'accepted'
                  ? '#e6ffed'
                  : requestStatus === 'declined'
                  ? '#ffe6e6'
                  : 'transparent',
            }}
          >
            <h4>
              {req.table_name} #{req.record_id} ({req.request_type})
            </h4>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '0.25em' }}></th>
                  {columns.map((c) => (
                    <th
                      key={c}
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        textAlign: columnAlign[c],
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        verticalAlign: 'top',
                      }}
                    >
                      {headerMap[c] || translateToMn(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '0.25em' }}>
                    Original
                  </th>
                  {columns.map((c) => (
                    <td
                      key={c}
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        background: fieldMap[c].changed ? '#ffe6e6' : undefined,
                        textAlign: columnAlign[c],
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        verticalAlign: 'top',
                      }}
                    >
                      {renderValue(fieldMap[c].before)}
                    </td>
                  ))}
                </tr>
                {req.request_type !== 'delete' && (
                  <tr>
                    <th style={{ border: '1px solid #ccc', padding: '0.25em' }}>
                      Proposed
                    </th>
                    {columns.map((c) => (
                      <td
                        key={c}
                        style={{
                          border: '1px solid #ccc',
                          padding: '0.25em',
                          background: fieldMap[c].changed
                            ? '#e6ffe6'
                            : undefined,
                          textAlign: columnAlign[c],
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          verticalAlign: 'top',
                        }}
                      >
                        {renderValue(fieldMap[c].after)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
            {!isPending ? (
              <p>Request {requestStatus}</p>
            ) : canRespond ? (
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
            ) : isRequester ? (
              <p>Awaiting senior response…</p>
            ) : null}
            {req.error && <p style={{ color: 'red' }}>{req.error}</p>}
          </div>
        );
      })}
      {!loading && requests.length === 0 && <p>No pending requests.</p>}
    </div>
  );
}


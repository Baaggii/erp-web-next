// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { diff } from 'jsondiffpatch';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { debugLog } from '../utils/debug.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import { translateToMn } from '../utils/translateToMn.js';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

function ch(n) {
  return Math.round(n * 8);
}

const MAX_WIDTH = ch(40);

function getAverageLength(values) {
  const list = values
    .filter((v) => v !== null && v !== undefined)
    .map((v) =>
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    )
    .slice(0, 20);
  if (list.length === 0) return 0;
  return Math.round(list.reduce((s, v) => s + v.length, 0) / list.length);
}

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

function normalizeEmpId(id) {
  return String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/^0+/, '');
}

// Fallback date picker used by bundlers that replace native date inputs
// with a custom component. It simply renders a standard date input.
function CustomDatePicker(props) {
  return <input type="date" {...props} />;
}

export default function RequestsPage() {
  const { user, session } = useAuth();
  const { markSeen } = usePendingRequests();
  const seniorEmpId =
    session && user?.empid && !(Number(session.senior_empid) > 0)
      ? user.empid
      : null;
  const isSenior = Boolean(seniorEmpId);

  const [activeTab, setActiveTab] = useState(
    isSenior ? 'incoming' : 'outgoing',
  );
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [incomingLoading, setIncomingLoading] = useState(true);
  const [outgoingLoading, setOutgoingLoading] = useState(false);
  const [incomingError, setIncomingError] = useState(null);
  const [outgoingError, setOutgoingError] = useState(null);

  // filters
  const [requestedEmpid, setRequestedEmpid] = useState('');
  const [tableName, setTableName] = useState('');
  const [status, setStatus] = useState('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [incomingReloadKey, setIncomingReloadKey] = useState(0);
  const [outgoingReloadKey, setOutgoingReloadKey] = useState(0);

  const configCache = useRef({});

  const requests =
    activeTab === 'incoming' ? incomingRequests : outgoingRequests;
  const loading =
    activeTab === 'incoming' ? incomingLoading : outgoingLoading;
  const error = activeTab === 'incoming' ? incomingError : outgoingError;

  const requesterOptions = useMemo(() => {
    const set = new Set();
    incomingRequests.forEach((r) => set.add(String(r.emp_id).trim()));
    return Array.from(set);
  }, [incomingRequests]);

  const tableOptions = useMemo(() => {
    const set = new Set();
    requests.forEach((r) => set.add(r.table_name));
    return Array.from(set);
  }, [requests]);

  const allFields = useMemo(() => {
    const set = new Set();
    requests.forEach((r) => r.fields?.forEach((f) => set.add(f.name)));
    return Array.from(set);
  }, [requests]);

  const headerMap = useHeaderMappings(allFields);
  async function enrichRequests(data) {
    return Promise.all(
      data.map(async (req) => {
        let original = null;
        try {
          const res2 = await fetch(
            `${API_BASE}/tables/${req.table_name}/${req.record_id}`,
            { credentials: 'include' },
          );
          if (
            res2.ok &&
            res2.headers.get('content-type')?.includes('application/json')
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
              res3.headers.get('content-type')?.includes('application/json')
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
            const emptyBefore =
              f.before === undefined || f.before === null || f.before === '';
            const emptyAfter =
              f.after === undefined || f.after === null || f.after === '';
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
  }

  useEffect(() => {
    if (activeTab !== 'incoming') return;
    if (!isSenior) {
      setIncomingLoading(false);
      return;
    }
    markSeen();
    async function load() {
      debugLog('Loading pending requests');
      setIncomingLoading(true);
      setIncomingError(null);
      try {
        const params = new URLSearchParams({
          senior_empid: seniorEmpId,
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
        const enriched = await enrichRequests(data);
        setIncomingRequests(enriched);
      } catch (err) {
        console.error(err);
        setIncomingError('Failed to load requests');
      } finally {
        setIncomingLoading(false);
      }
    }

    load();
  }, [
    activeTab,
    isSenior,
    markSeen,
    seniorEmpId,
    status,
    requestedEmpid,
    tableName,
    dateFrom,
    dateTo,
    incomingReloadKey,
  ]);

  useEffect(() => {
    if (activeTab !== 'outgoing') return;
    async function load() {
      setOutgoingLoading(true);
      setOutgoingError(null);
      try {
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (tableName) params.append('table_name', tableName);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        const res = await fetch(
          `${API_BASE}/pending_request/outgoing?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const enriched = await enrichRequests(data);
        setOutgoingRequests(enriched);
      } catch (err) {
        console.error(err);
        setOutgoingError('Failed to load requests');
      } finally {
        setOutgoingLoading(false);
      }
    }
    load();
  }, [
    activeTab,
    user?.empid,
    status,
    tableName,
    dateFrom,
    dateTo,
    outgoingReloadKey,
  ]);

  const updateNotes = (id, value) => {
    setIncomingRequests((reqs) =>
      reqs.map((r) => (r.request_id === id ? { ...r, notes: value } : r)),
    );
  };

  const respond = async (id, respStatus) => {
    const reqItem = incomingRequests.find((r) => r.request_id === id);
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
      setIncomingRequests((reqs) =>
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
      setIncomingRequests((reqs) =>
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
        <button
          onClick={() => setActiveTab('incoming')}
          style={{
            marginRight: '0.5em',
            fontWeight: activeTab === 'incoming' ? 'bold' : 'normal',
          }}
        >
          Incoming requests ({incomingRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          style={{ fontWeight: activeTab === 'outgoing' ? 'bold' : 'normal' }}
        >
          Outgoing requests ({outgoingRequests.length})
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (activeTab === 'incoming') {
            setIncomingReloadKey((k) => k + 1);
          } else {
            setOutgoingReloadKey((k) => k + 1);
          }
        }}
        style={{ marginBottom: '1em' }}
      >
        {activeTab === 'incoming' && (
          <label style={{ marginRight: '0.5em' }}>
            Requester:
            <select
              value={requestedEmpid}
              onChange={(e) => setRequestedEmpid(e.target.value)}
              style={{ marginLeft: '0.25em' }}
            >
              <option value="">Any</option>
              {requesterOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ marginRight: '0.5em' }}>
          Transaction Type:
          <select
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          >
            <option value="">Any</option>
            {tableOptions.map((tbl) => (
              <option key={tbl} value={tbl}>
                {tbl}
              </option>
            ))}
          </select>
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
          <CustomDatePicker
            value={dateFrom}
            onChange={setDateFrom}
            style={{ marginLeft: '0.25em' }}
          />
        </label>
        <label style={{ marginRight: '0.5em' }}>
          To:
          <CustomDatePicker
            value={dateTo}
            onChange={setDateTo}
            style={{ marginLeft: '0.25em' }}
          />
        </label>
        <button type="submit">Apply</button>
      </form>
      {activeTab === 'incoming' && !isSenior && (
        <p>Pending requests are only available for senior users.</p>
      )}
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
        const userEmp = String(user.empid).trim();
        const requestStatus = req.status || req.response_status;
        const requestStatusLower = requestStatus
          ? String(requestStatus).trim().toLowerCase()
          : undefined;
        const isRequester = String(req.emp_id).trim() === userEmp;

        const seniorStr = String(req.senior_empid ?? '').trim();
        const seniorNorm = seniorStr.toLowerCase();
        const assignedSenior =
          seniorStr && !['0', 'null', 'undefined'].includes(seniorNorm)
            ? seniorStr
            : null;

        const isPending =
          !requestStatusLower || requestStatusLower === 'pending';
        const canRespond =
          !isRequester &&
          isPending &&
          (!assignedSenior || assignedSenior === userEmp);

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
              style={{ width: '100%', borderCollapse: 'collapse' }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      border: '1px solid #ccc',
                      padding: '0.25em',
                      whiteSpace: 'nowrap',
                      width: '1%',
                    }}
                  />
                  {columns.map((c) => (
                    <th
                      key={c}
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        textAlign: columnAlign[c],
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {headerMap[c] || translateToMn(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th
                    style={{
                      border: '1px solid #ccc',
                      padding: '0.25em',
                      whiteSpace: 'nowrap',
                      width: '1%',
                      textAlign: 'left',
                      verticalAlign: 'top',
                    }}
                  >
                    Original
                  </th>
                  {columns.map((c) => (
                    <td
                      key={c}
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        background: fieldMap[c].changed
                          ? '#ffe6e6'
                          : undefined,
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
                    <th
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        whiteSpace: 'nowrap',
                        width: '1%',
                        textAlign: 'left',
                        verticalAlign: 'top',
                      }}
                    >
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


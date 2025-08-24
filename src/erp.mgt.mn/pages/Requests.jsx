// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { diff } from 'jsondiffpatch';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { debugLog } from '../utils/debug.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import { translateToMn } from '../utils/translateToMn.js';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import { useSearchParams } from 'react-router-dom';
import DateRangePicker from '../components/DateRangePicker.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

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
  if (
    typeof val === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
  ) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      val = formatTimestamp(d);
    }
  }
  return <span style={style}>{String(val ?? '')}</span>;
}

function normalizeEmpId(id) {
  return String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/^0+/, '');
}

export default function RequestsPage() {
  const { user, session } = useAuth();
  const { incoming: incomingCounts, outgoing: outgoingCounts, markSeen } =
    usePendingRequests();

  const seniorEmpId =
    session && user?.empid && !(Number(session.senior_empid) > 0)
      ? user.empid
      : null;

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const initialStatus = searchParams.get('status');

  // Always default to the user's own outgoing requests. Seniors can
  // still switch to the incoming tab manually.
  const [activeTab, setActiveTab] = useState(
    initialTab === 'incoming' ? 'incoming' : 'outgoing',
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
  const [status, setStatus] = useState(initialStatus || 'pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [requestType, setRequestType] = useState('');
  const [dateField, setDateField] = useState('created');
  const [incomingReloadKey, setIncomingReloadKey] = useState(0);
  const [outgoingReloadKey, setOutgoingReloadKey] = useState(0);
  const [incomingPage, setIncomingPage] = useState(1);
  const [outgoingPage, setOutgoingPage] = useState(1);

  const [perPage, setPerPage] = useState(2);
  const [incomingTotal, setIncomingTotal] = useState(0);
  const [outgoingTotal, setOutgoingTotal] = useState(0);

  const configCache = useRef({});

  const requests =
    activeTab === 'incoming' ? incomingRequests : outgoingRequests;
  const loading =
    activeTab === 'incoming' ? incomingLoading : outgoingLoading;
  const error = activeTab === 'incoming' ? incomingError : outgoingError;
  const currentPage = activeTab === 'incoming' ? incomingPage : outgoingPage;
  const total = activeTab === 'incoming' ? incomingTotal : outgoingTotal;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

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
  useEffect(() => {
    const today = formatTimestamp(new Date()).slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab === 'incoming' ? 'incoming' : 'outgoing');
    }
    const spStatus = searchParams.get('status');
    if (spStatus && spStatus !== status) {
      setStatus(spStatus);
    }
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('tab', activeTab);
    params.set('status', status);
    setSearchParams(params, { replace: true });
  }, [activeTab, status, setSearchParams]);
  useEffect(() => {
    setIncomingPage(1);
  }, [status, requestedEmpid, tableName, requestType, dateFrom, dateTo, dateField]);
  useEffect(() => {
    setOutgoingPage(1);
  }, [status, tableName, requestType, dateFrom, dateTo, dateField]);
  async function enrichRequests(data) {
    const tables = Array.from(new Set(data.map((r) => r.table_name)));
    await Promise.all(
      tables
        .filter((t) => !configCache.current[t])
        .map(async (t) => {
          try {
            const res = await fetch(`${API_BASE}/display_fields?table=${t}`, {
              credentials: 'include',
            });
            configCache.current[t] = res.ok
              ? await res.json()
              : { displayFields: [] };
          } catch {
            configCache.current[t] = { displayFields: [] };
          }
        }),
    );

    return data.map((req) => {
      const original = req.original || null;
      const cfg = configCache.current[req.table_name] || { displayFields: [] };
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
    });
  }

  useEffect(() => {
    if (activeTab !== 'incoming' || !seniorEmpId || !dateFrom || !dateTo)
      return;
    markSeen();
    async function load() {
      debugLog('Loading pending requests');
      setIncomingLoading(true);
      setIncomingError(null);
      try {
        const params = new URLSearchParams({
          senior_empid: seniorEmpId,
          page: incomingPage,
          per_page: perPage,
        });
        if (status) params.append('status', status);
        if (requestedEmpid) params.append('requested_empid', requestedEmpid);
        if (tableName) params.append('table_name', tableName);
        if (requestType) params.append('request_type', requestType);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (dateField) params.append('date_field', dateField);
        const res = await fetch(
          `${API_BASE}/pending_request?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const enriched = await enrichRequests(data.rows || []);
        setIncomingRequests(enriched);
        setIncomingTotal(data.total || 0);
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
      markSeen,
      seniorEmpId,
      status,
      requestedEmpid,
      tableName,
      requestType,
      dateFrom,
      dateTo,
      dateField,
      incomingReloadKey,
      incomingPage,
      perPage,
    ]);

  useEffect(() => {
    if (activeTab !== 'outgoing' || !dateFrom || !dateTo) return;
    markSeen();
    async function load() {
      setOutgoingLoading(true);
      setOutgoingError(null);
      try {
        const params = new URLSearchParams({
          page: outgoingPage,
          per_page: perPage,
        });
        if (status) params.append('status', status);
        if (tableName) params.append('table_name', tableName);
        if (requestType) params.append('request_type', requestType);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (dateField) params.append('date_field', dateField);
        const res = await fetch(
          `${API_BASE}/pending_request/outgoing?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const enriched = await enrichRequests(data.rows || []);
        setOutgoingRequests(enriched);
        setOutgoingTotal(data.total || 0);
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
      markSeen,
      user?.empid,
      status,
      tableName,
      requestType,
      dateFrom,
      dateTo,
      dateField,
      outgoingReloadKey,
      outgoingPage,
      perPage,
    ]);

  const updateNotes = (id, value) => {
    setIncomingRequests((reqs) =>
      reqs.map((r) => (r.request_id === id ? { ...r, notes: value } : r)),
    );
  };

  const respond = async (id, respStatus) => {
    const reqItem = incomingRequests.find((r) => r.request_id === id);
    if (!reqItem?.notes?.trim()) {
      setIncomingRequests((reqs) =>
        reqs.map((r) =>
          r.request_id === id ? { ...r, error: 'Response notes required' } : r,
        ),
      );
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/pending_request/${id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: respStatus,
          response_notes: reqItem.notes,
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
      <div
        style={{
          marginBottom: '1em',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5em',
        }}
      >
        <button
          onClick={() => setActiveTab('incoming')}
          style={{
            marginRight: '0.5em',
            fontWeight: activeTab === 'incoming' ? 'bold' : 'normal',
          }}
        >
          {`Incoming requests (${incomingCounts[status]?.count ?? 0})`}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          style={{ fontWeight: activeTab === 'outgoing' ? 'bold' : 'normal' }}
        >
          {`Outgoing requests (${outgoingCounts[status]?.count ?? 0})`}
        </button>
        {activeTab === 'incoming' && (
          <button onClick={() => setIncomingReloadKey((k) => k + 1)}>
            Refresh
          </button>
        )}
        {activeTab === 'outgoing' && (
          <button onClick={() => setOutgoingReloadKey((k) => k + 1)}>
            Refresh
          </button>
        )}
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
          Request Type:
          <select
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          >
            <option value="">Any</option>
            <option value="edit">Edit Request</option>
            <option value="delete">Delete Request</option>
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
          Date Field:
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          >
            <option value="created">Created</option>
            <option value="responded">Responded</option>
          </select>
        </label>
        <label style={{ marginRight: '0.5em' }}>
          Date:
          <DateRangePicker
            start={dateFrom}
            end={dateTo}
            onChange={({ start, end }) => {
              setDateFrom(start);
              setDateTo(end);
            }}
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
            <div style={{ overflow: 'auto' }}>
              <table
                style={{ minWidth: 'max-content', borderCollapse: 'collapse' }}
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
            </div>
            {!isPending ? (
              <p>Request {requestStatus}</p>
            ) : canRespond ? (
              <>
                <textarea
                  placeholder="Response Notes"
                  value={req.notes}
                  onChange={(e) => updateNotes(req.request_id, e.target.value)}
                  style={{ width: '100%', minHeight: '4em' }}
                />
                <div style={{ marginTop: '0.5em' }}>
                  <button
                    onClick={() => respond(req.request_id, 'accepted')}
                    disabled={!req.notes?.trim()}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond(req.request_id, 'declined')}
                    style={{ marginLeft: '0.5em' }}
                    disabled={!req.notes?.trim()}
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginTop: '1em',
          gap: '1rem',
        }}
      >
        <div>
          Rows per page:
          <input
            type="number"
            value={perPage}
            onChange={(e) => {
              const val = Number(e.target.value) || 1;
              setIncomingPage(1);
              setOutgoingPage(1);
              setPerPage(val);
            }}
            min="1"
            style={{ marginLeft: '0.25rem', width: '4rem' }}
          />
        </div>
        <div>
          <button
            onClick={() =>
              activeTab === 'incoming'
                ? setIncomingPage(1)
                : setOutgoingPage(1)
            }
            disabled={currentPage === 1 || loading}
            style={{ marginRight: '0.25rem' }}
          >
            {'<<'}
          </button>
          <button
            onClick={() =>
              activeTab === 'incoming'
                ? setIncomingPage((p) => Math.max(1, p - 1))
                : setOutgoingPage((p) => Math.max(1, p - 1))
            }
            disabled={currentPage === 1 || loading}
            style={{ marginRight: '0.25rem' }}
          >
            {'<'}
          </button>
          <span>
            Page
            <input
              type="number"
              value={currentPage}
              onChange={(e) => {
                let val = Number(e.target.value) || 1;
                if (val < 1) val = 1;
                if (val > totalPages) val = totalPages;
                activeTab === 'incoming'
                  ? setIncomingPage(val)
                  : setOutgoingPage(val);
              }}
              style={{ width: '3rem', margin: '0 0.25rem', textAlign: 'center' }}
              min="1"
              max={totalPages}
            />
            {` of ${totalPages}`}
          </span>
          <button
            onClick={() =>
              activeTab === 'incoming'
                ? setIncomingPage((p) => Math.min(totalPages, p + 1))
                : setOutgoingPage((p) => Math.min(totalPages, p + 1))
            }
            disabled={currentPage >= totalPages || loading}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>'}
          </button>
          <button
            onClick={() =>
              activeTab === 'incoming'
                ? setIncomingPage(totalPages)
                : setOutgoingPage(totalPages)
            }
            disabled={currentPage >= totalPages || loading}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>>'}
          </button>
        </div>
      </div>
      {!loading && requests.length === 0 && <p>No pending requests.</p>}
    </div>
  );
}


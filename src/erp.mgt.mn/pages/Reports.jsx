// src/erp.mgt.mn/pages/Reports.jsx
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import ReportTable from '../components/ReportTable.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import CustomDatePicker from '../components/CustomDatePicker.jsx';
import useButtonPerms from '../hooks/useButtonPerms.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';
import Modal from '../components/Modal.jsx';

const REPORT_REQUEST_TABLE = 'report_transaction_locks';

export default function Reports() {
  const { company, branch, department, user, session } = useContext(AuthContext);
  const buttonPerms = useButtonPerms();
  const { addToast } = useToast();
  const generalConfig = useGeneralConfig();
  const [procedures, setProcedures] = useState([]);
  const [selectedProc, setSelectedProc] = useState('');
  const [procParams, setProcParams] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [result, setResult] = useState(null);
  const [manualParams, setManualParams] = useState({});
  const presetSelectRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const manualInputRefs = useRef({});
  const runButtonRef = useRef(null);
  const procNames = useMemo(() => procedures.map((p) => p.name), [procedures]);
  const procMap = useHeaderMappings(procNames);

  const handleSnapshotReady = useCallback((data) => {
    setSnapshot(data || null);
  }, []);

  const hasSupervisor = useMemo(
    () =>
      Number(session?.senior_empid) > 0 || Number(session?.senior_plan_empid) > 0,
    [session?.senior_empid, session?.senior_plan_empid],
  );
  const canRequestApproval = Boolean(session?.senior_plan_empid);
  const canReviewApprovals = !hasSupervisor;
  const showApprovalControls = canRequestApproval || canReviewApprovals;

  function getLabel(name) {
    return (
      generalConfig.general?.procLabels?.[name] || procMap[name] || name
    );
  }

  useEffect(() => {
    const prefix = generalConfig?.general?.reportProcPrefix || '';
    const params = new URLSearchParams();
    if (branch) params.set('branchId', branch);
    if (department) params.set('departmentId', department);
    if (prefix) params.set('prefix', prefix);
    fetch(
      `/api/report_procedures${
        params.toString() ? `?${params.toString()}` : ''
      }`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : { procedures: [] }))
      .then((data) => {
        const list = Array.isArray(data.procedures)
          ? data.procedures.map((p) =>
              typeof p === 'string' ? { name: p, isDefault: data.isDefault } : p,
            )
          : [];
        setProcedures(list);
      })
      .catch(() => setProcedures([]));
  }, [branch, department, generalConfig?.general?.reportProcPrefix]);

  useEffect(() => {
    if (!selectedProc) {
      setProcParams([]);
      setManualParams({});
      return;
    }
    const params = new URLSearchParams();
    if (branch) params.set('branchId', branch);
    if (department) params.set('departmentId', department);
    fetch(
      `/api/procedures/${encodeURIComponent(selectedProc)}/params${
        params.toString() ? `?${params.toString()}` : ''
      }`,
      {
        credentials: 'include',
      },
    )
      .then((res) => (res.ok ? res.json() : { parameters: [] }))
      .then((data) => setProcParams(data.parameters || []))
      .catch(() => setProcParams([]));
  }, [selectedProc, branch, department]);

  useEffect(() => {
    setResult(null);
    setManualParams({});
    setSelectedTransactions([]);
    setApprovalReason('');
    setSnapshot(null);
  }, [selectedProc]);

  const dateParamInfo = useMemo(() => {
    const info = {
      hasStartParam: false,
      hasEndParam: false,
      managedIndices: new Set(),
    };
    procParams.forEach((param, index) => {
      const name = param.toLowerCase();
      const isStart = name.includes('start') || name.includes('from');
      const isEnd = name.includes('end') || name.includes('to');
      if (isStart) {
        info.hasStartParam = true;
        info.managedIndices.add(index);
      }
      if (isEnd) {
        info.hasEndParam = true;
        info.managedIndices.add(index);
      }
    });
    return info;
  }, [procParams]);

  const { hasStartParam, hasEndParam, managedIndices } = dateParamInfo;
  const hasDateParams = hasStartParam || hasEndParam;

  const autoParams = useMemo(() => {
    return procParams.map((p) => {
      const name = p.toLowerCase();
      if (name.includes('start') || name.includes('from')) return startDate || null;
      if (name.includes('end') || name.includes('to')) return endDate || null;
      if (name.includes('branch')) return branch ?? null;
      if (name.includes('department')) return department ?? null;
      if (name.includes('company')) return company ?? null;
      if (name.includes('user') || name.includes('emp')) return user?.empid ?? null;
      return null;
    });
  }, [procParams, startDate, endDate, company, branch, department, user]);

  const manualParamNames = useMemo(() => {
    return procParams.reduce((list, param, index) => {
      if (managedIndices.has(index)) return list;
      if (autoParams[index] !== null) return list;
      list.push(param);
      return list;
    }, []);
  }, [procParams, managedIndices, autoParams]);

  const activeControlRefs = useMemo(() => {
    const refs = [];
    if (hasDateParams) refs.push(presetSelectRef);
    if (hasStartParam) refs.push(startDateRef);
    if (hasEndParam) refs.push(endDateRef);

    const manualRefNames = new Set(manualParamNames);
    Object.keys(manualInputRefs.current).forEach((name) => {
      if (!manualRefNames.has(name)) delete manualInputRefs.current[name];
    });

    manualParamNames.forEach((name) => {
      if (!manualInputRefs.current[name]) {
        manualInputRefs.current[name] = React.createRef();
      }
      refs.push(manualInputRefs.current[name]);
    });

    refs.push(runButtonRef);
    return refs;
  }, [hasDateParams, hasStartParam, hasEndParam, manualParamNames]);

  useEffect(() => {
    if (!selectedProc) return;
    const firstFocusable = activeControlRefs.find((ref) => ref?.current);
    if (firstFocusable) {
      firstFocusable.current.focus();
    }
  }, [selectedProc, activeControlRefs]);

  const finalParams = useMemo(() => {
    return procParams.map((p, i) => {
      const auto = autoParams[i];
      return auto ?? manualParams[p] ?? null;
    });
  }, [procParams, autoParams, manualParams]);

  const allParamsProvided = useMemo(
    () => finalParams.every((v) => v !== null && v !== ''),
    [finalParams],
  );

  function handleParameterKeyDown(event, currentRef) {
    if (event.key !== 'Enter') return;
    const currentIndex = activeControlRefs.findIndex((ref) => ref === currentRef);
    if (currentIndex === -1) return;
    event.preventDefault();
    const nextRef = activeControlRefs[currentIndex + 1];
    if (nextRef?.current) {
      nextRef.current.focus();
      return;
    }
    runReport();
  }

  function handlePresetChange(e) {
    const value = e.target.value;
    setDatePreset(value);
    if (value === 'custom') return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let start, end;
    switch (value) {
      case 'month':
        start = new Date(y, m, 1);
        end = new Date(y, m + 1, 1);
        break;
      case 'q1':
        start = new Date(y, 0, 1);
        end = new Date(y, 3, 1);
        break;
      case 'q2':
        start = new Date(y, 3, 1);
        end = new Date(y, 6, 1);
        break;
      case 'q3':
        start = new Date(y, 6, 1);
        end = new Date(y, 9, 1);
        break;
      case 'q4':
        start = new Date(y, 9, 1);
        end = new Date(y + 1, 0, 1);
        break;
      case 'quarter': {
        const q = Math.floor(m / 3);
        start = new Date(y, q * 3, 1);
        end = new Date(y, q * 3 + 3, 1);
        break;
      }
      case 'year':
        start = new Date(y, 0, 1);
        end = new Date(y + 1, 0, 1);
        break;
      default:
        return;
    }
    const fmt = (d) =>
      d instanceof Date ? formatTimestamp(d).slice(0, 10) : '';
    if (hasStartParam) {
      setStartDate(normalizeDateInput(fmt(start), 'YYYY-MM-DD'));
    }
    if (hasEndParam) {
      setEndDate(normalizeDateInput(fmt(end), 'YYYY-MM-DD'));
    }
  }

  async function runReport() {
    if (!selectedProc) return;
    if (!allParamsProvided) {
      addToast('Missing parameters', 'error');
      return;
    }
    const paramMap = procParams.reduce((acc, p, i) => {
      acc[p] = finalParams[i];
      return acc;
    }, {});
    const label = getLabel(selectedProc);
    addToast(`Calling ${label}`, 'info');
    try {
      const q = new URLSearchParams();
      if (branch) q.set('branchId', branch);
      if (department) q.set('departmentId', department);
      const res = await fetch(
        `/api/procedures${q.toString() ? `?${q.toString()}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: selectedProc, params: finalParams }),
        },
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({ row: [] }));
        const rows = Array.isArray(data.row) ? data.row : [];
        addToast(
          `${label} returned ${rows.length} row${rows.length === 1 ? '' : 's'}`,
          'success',
        );
        setSelectedTransactions([]);
        setApprovalReason('');
        setSnapshot(null);
        setResult({
          name: selectedProc,
          params: paramMap,
          rows,
          fieldTypeMap: data.fieldTypeMap || {},
        });
        setNewTxId('');
      } else {
        addToast('Failed to run procedure', 'error');
      }
    } catch {
      addToast('Failed to run procedure', 'error');
    }
  }

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      }),
    [],
  );

  const formatSnapshotCell = useCallback(
    (value, column, fieldTypes = {}) => {
      if (value === null || value === undefined) return '';
      const type = fieldTypes?.[column];
      if (type === 'date' || type === 'datetime') {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return formatTimestamp(d);
      }
      if (typeof value === 'number') {
        return numberFormatter.format(value);
      }
      if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
          const d = new Date(value);
          if (!Number.isNaN(d.getTime())) return formatTimestamp(d);
        }
        return value;
      }
      return String(value);
    },
    [numberFormatter],
  );

  const formatDateTime = useCallback((value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return formatTimestamp(d);
    if (typeof value === 'string') return value;
    return String(value);
  }, []);

  function renderSnapshotTable(snapshotData) {
    if (
      !snapshotData ||
      !Array.isArray(snapshotData.rows) ||
      snapshotData.rows.length === 0
    ) {
      return <p style={{ marginTop: '0.25rem' }}>No snapshot captured.</p>;
    }
    const cols =
      Array.isArray(snapshotData.columns) && snapshotData.columns.length
        ? snapshotData.columns
        : Object.keys(snapshotData.rows[0] || {});
    return (
      <div
        style={{
          maxHeight: '300px',
          overflow: 'auto',
          border: '1px solid #d1d5db',
          borderRadius: '0.5rem',
          marginTop: '0.5rem',
        }}
      >
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ background: '#f3f4f6' }}>
            <tr>
              {cols.map((col) => (
                <th
                  key={col}
                  style={{
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    textAlign: 'left',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshotData.rows.map((row, idx) => (
              <tr key={idx}>
                {cols.map((col) => (
                  <td
                    key={col}
                    style={{
                      padding: '0.25rem',
                      border: '1px solid #d1d5db',
                      whiteSpace: 'nowrap',
                      maxWidth: '16rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {formatSnapshotCell(row?.[col], col, snapshotData.fieldTypeMap || {})}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderReportMetadata(meta) {
    if (!meta) {
      return <p>No report metadata available.</p>;
    }
    const paramEntries = Object.entries(meta.parameters || {});
    const rowCount =
      typeof meta.snapshot?.rowCount === 'number'
        ? meta.snapshot.rowCount
        : Array.isArray(meta.snapshot?.rows)
        ? meta.snapshot.rows.length
        : null;
    return (
      <div>
        <div>
          <strong>Procedure:</strong> {meta.procedure || '—'}
        </div>
        {meta.executed_at && (
          <div>
            <strong>Executed:</strong> {formatDateTime(meta.executed_at)}
          </div>
        )}
        {rowCount !== null && (
          <div>
            <strong>Rows in result:</strong> {rowCount}
          </div>
        )}
        <div style={{ marginTop: '0.5rem' }}>
          <strong>Parameters</strong>
          {paramEntries.length ? (
            <ul style={{ margin: '0.25rem 0 0 1.25rem' }}>
              {paramEntries.map(([key, value]) => (
                <li key={key}>
                  {key}: {String(value ?? '')}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '0.25rem 0 0' }}>No parameters provided.</p>
          )}
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <strong>Transactions</strong>
          {Array.isArray(meta.transactions) && meta.transactions.length ? (
            <ul style={{ margin: '0.25rem 0 0 1.25rem' }}>
              {meta.transactions.map((tx, idx) => (
                <li key={`${tx.table}-${tx.recordId}-${idx}`}>
                  {tx.table}#{tx.recordId}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '0.25rem 0 0' }}>No transactions selected.</p>
          )}
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <strong>Snapshot</strong>
          {renderSnapshotTable(meta.snapshot)}
        </div>
      </div>
    );
  }

  function handleAddTransaction(e) {
    e.preventDefault();
    const table = newTxTable.trim();
    const recordId = newTxId.trim();
    if (!table) {
      addToast('Transaction table is required', 'error');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      addToast(
        'Table name may only include letters, numbers and underscores',
        'error',
      );
      return;
    }
    if (!recordId) {
      addToast('Transaction ID is required', 'error');
      return;
    }
    setSelectedTransactions((prev) => {
      const exists = prev.some(
        (tx) => tx.table === table && String(tx.recordId) === recordId,
      );
      if (exists) return prev;
      return [...prev, { table, recordId }];
    });
    setNewTxTable(table);
    setNewTxId('');
  }

  function handleRemoveTransaction(index) {
    setSelectedTransactions((prev) => prev.filter((_, idx) => idx !== index));
  }

  const openApprovalModal = useCallback(() => {
    setApprovalModalOpen(true);
    setApprovalRefreshKey((k) => k + 1);
  }, []);

  async function handleRequestApproval() {
    if (!canRequestApproval) return;
    if (!result) {
      addToast('Run a report before requesting approval', 'error');
      return;
    }
    if (!selectedTransactions.length) {
      addToast('Add at least one transaction to request approval', 'error');
      return;
    }
    const reason = approvalReason.trim();
    if (!reason) {
      addToast('Approval reason is required', 'error');
      return;
    }
    if (!snapshot) {
      addToast('Unable to capture report snapshot', 'error');
      return;
    }
    const proposedData = {
      procedure: snapshot?.procedure || result.name,
      parameters: snapshot?.params || result.params,
      transactions: selectedTransactions.map((tx) => ({
        table: tx.table,
        recordId: String(tx.recordId),
      })),
      snapshot: {
        columns: snapshot?.columns || [],
        rows: snapshot?.rows || [],
        fieldTypeMap: snapshot?.fieldTypeMap || {},
        rowCount: snapshot?.rowCount ?? snapshot?.rows?.length ?? 0,
      },
      executed_at: snapshot?.executed_at || new Date().toISOString(),
    };
    setRequestingApproval(true);
    try {
      const recordId = `report-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const res = await fetch('/api/pending_request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          table_name: REPORT_REQUEST_TABLE,
          record_id: recordId,
          request_type: 'report_approval',
          request_reason: reason,
          proposed_data: proposedData,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to submit approval request');
      }
      addToast('Report approval request submitted', 'success');
      setSelectedTransactions([]);
      setApprovalReason('');
      window.dispatchEvent(new Event('pending-request-refresh'));
      setApprovalRefreshKey((k) => k + 1);
    } catch (err) {
      addToast(err.message || 'Failed to submit approval request', 'error');
    } finally {
      setRequestingApproval(false);
    }
  }

  async function handleRespond(req, status) {
    const defaultNote = status === 'accepted' ? 'Approved' : 'Declined';
    const note = window.prompt('Enter response notes', defaultNote);
    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) {
      addToast('Response notes are required', 'error');
      return;
    }
    setRespondingRequestId(req.request_id);
    try {
      const res = await fetch(`/api/pending_request/${req.request_id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, response_notes: trimmed }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Not allowed to respond to this request');
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to respond to request');
      }
      addToast(
        status === 'accepted' ? 'Report approval granted' : 'Report approval declined',
        'success',
      );
      window.dispatchEvent(new Event('pending-request-refresh'));
      setApprovalRefreshKey((k) => k + 1);
    } catch (err) {
      addToast(err.message || 'Failed to respond to request', 'error');
    } finally {
      setRespondingRequestId(null);
    }
  }

  useEffect(() => {
    if (!approvalModalOpen) return undefined;
    let cancelled = false;
    async function loadApprovals() {
      setApprovalLoading(true);
      setApprovalError('');
      let outgoingRows = [];
      let incomingRows = [];
      let errorMsg = '';
      try {
        const res = await fetch(
          `/api/pending_request/outgoing?request_type=report_approval&per_page=50`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          outgoingRows = Array.isArray(data.rows) ? data.rows : [];
        } else {
          errorMsg = 'Failed to load report approvals';
        }
      } catch {
        errorMsg = 'Failed to load report approvals';
      }
      if (canReviewApprovals && user?.empid) {
        try {
          const params = new URLSearchParams({
            request_type: 'report_approval',
            status: 'pending',
            per_page: '50',
            page: '1',
            senior_empid: user.empid,
          });
          const res = await fetch(`/api/pending_request?${params.toString()}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            incomingRows = Array.isArray(data.rows) ? data.rows : [];
          } else {
            errorMsg = errorMsg || 'Failed to load report approvals';
          }
        } catch {
          errorMsg = errorMsg || 'Failed to load report approvals';
        }
      }
      if (!cancelled) {
        setApprovalData({ incoming: incomingRows, outgoing: outgoingRows });
        setApprovalError(errorMsg);
        setApprovalLoading(false);
      }
    }
    loadApprovals();
    return () => {
      cancelled = true;
    };
  }, [approvalModalOpen, approvalRefreshKey, canReviewApprovals, user?.empid]);

  return (
    <div>
      <h2>Тайлан</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        <select
          value={selectedProc}
          onChange={(e) => {
            setSelectedProc(e.target.value);
            setDatePreset('custom');
            setStartDate('');
            setEndDate('');
          }}
          disabled={procedures.length === 0}
        >
          <option value="">-- select --</option>
          {procedures.map((p) => (
            <option key={p.name} value={p.name}>
              {getLabel(p.name)} {p.isDefault ? '(default)' : '(company)'}
            </option>
          ))}
        </select>
        {procedures.length === 0 && (
          <span style={{ marginLeft: '0.5rem' }}>Тайлан тохируулаагүй байна.</span>
        )}
        {selectedProc && (
          <div style={{ marginTop: '0.5rem' }}>
            {hasDateParams && (
              <select
                value={datePreset}
                onChange={handlePresetChange}
                style={{ marginRight: '0.5rem' }}
                ref={presetSelectRef}
                onKeyDown={(event) => handleParameterKeyDown(event, presetSelectRef)}
              >
                <option value="custom">Custom</option>
                <option value="month">This month</option>
                <option value="q1">Quarter #1</option>
                <option value="q2">Quarter #2</option>
                <option value="q3">Quarter #3</option>
                <option value="q4">Quarter #4</option>
                <option value="quarter">This quarter</option>
                <option value="year">This year</option>
              </select>
            )}
            {hasStartParam && (
              <CustomDatePicker
                value={startDate}
                onChange={(v) => {
                  setStartDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                  setDatePreset('custom');
                }}
                inputRef={startDateRef}
                onKeyDown={(event) => handleParameterKeyDown(event, startDateRef)}
              />
            )}
            {hasEndParam && (
              <CustomDatePicker
                value={endDate}
                onChange={(v) => {
                  setEndDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                  setDatePreset('custom');
                }}
                style={{ marginLeft: '0.5rem' }}
                inputRef={endDateRef}
                onKeyDown={(event) => handleParameterKeyDown(event, endDateRef)}
              />
            )}
            {procParams.map((p, i) => {
              if (managedIndices.has(i)) return null;
              if (autoParams[i] !== null) return null;
              const val = manualParams[p] || '';
              const inputRef = manualInputRefs.current[p];
              return (
                <input
                  key={p}
                  type="text"
                  placeholder={p}
                  value={val}
                  onChange={(e) =>
                    setManualParams((m) => ({ ...m, [p]: e.target.value }))
                  }
                  style={{ marginLeft: '0.5rem' }}
                  ref={inputRef}
                  onKeyDown={(event) => handleParameterKeyDown(event, inputRef)}
                />
              );
            })}
            <button
              onClick={runReport}
              style={{ marginLeft: '0.5rem' }}
              disabled={!allParamsProvided}
              ref={runButtonRef}
              onKeyDown={(event) => handleParameterKeyDown(event, runButtonRef)}
            >
              Run
            </button>
          </div>
        )}
      </div>
      {showApprovalControls && (
        <div style={{ marginBottom: '1rem' }}>
          <button onClick={openApprovalModal}>View report approvals</button>
        </div>
      )}
      {result && (
        <>
          <ReportTable
            procedure={result.name}
            params={result.params}
            rows={result.rows}
            buttonPerms={buttonPerms}
            fieldTypeMap={result.fieldTypeMap}
            onSnapshotReady={handleSnapshotReady}
          />
          {canRequestApproval && (
            <div
              style={{
                marginTop: '1.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                padding: '1rem',
                background: '#f9fafb',
              }}
            >
              <h4 style={{ marginTop: 0 }}>Request report approval</h4>
              <p style={{ marginTop: '0.25rem' }}>
                Select the transactions that should be locked and provide a reason for
                your plan senior.
              </p>
              <form
                onSubmit={handleAddTransaction}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                }}
              >
                <input
                  type="text"
                  value={newTxTable}
                  onChange={(e) => setNewTxTable(e.target.value)}
                  placeholder="Transaction table"
                  style={{ minWidth: '12rem' }}
                />
                <input
                  type="text"
                  value={newTxId}
                  onChange={(e) => setNewTxId(e.target.value)}
                  placeholder="Record ID"
                  style={{ minWidth: '8rem' }}
                />
                <button type="submit">Add transaction</button>
              </form>
              <div style={{ marginTop: '0.75rem' }}>
                {selectedTransactions.length ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        borderCollapse: 'collapse',
                        width: '100%',
                        maxWidth: '40rem',
                      }}
                    >
                      <thead style={{ background: '#e5e7eb' }}>
                        <tr>
                          <th
                            style={{
                              textAlign: 'left',
                              padding: '0.25rem',
                              border: '1px solid #d1d5db',
                            }}
                          >
                            Table
                          </th>
                          <th
                            style={{
                              textAlign: 'left',
                              padding: '0.25rem',
                              border: '1px solid #d1d5db',
                            }}
                          >
                            Record ID
                          </th>
                          <th
                            style={{
                              textAlign: 'left',
                              padding: '0.25rem',
                              border: '1px solid #d1d5db',
                            }}
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTransactions.map((tx, idx) => (
                          <tr key={`${tx.table}-${tx.recordId}-${idx}`}>
                            <td
                              style={{
                                padding: '0.25rem',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              {tx.table}
                            </td>
                            <td
                              style={{
                                padding: '0.25rem',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              {tx.recordId}
                            </td>
                            <td
                              style={{
                                padding: '0.25rem',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleRemoveTransaction(idx)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No transactions selected yet.</p>
                )}
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold' }}>
                  Approval reason
                </label>
                <textarea
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  style={{ width: '100%', minHeight: '4rem', marginTop: '0.25rem' }}
                  placeholder="Explain why this report should be approved"
                />
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <button
                  onClick={handleRequestApproval}
                  disabled={
                    requestingApproval ||
                    !selectedTransactions.length ||
                    !approvalReason.trim() ||
                    !snapshot
                  }
                >
                  {requestingApproval ? 'Submitting…' : 'Request approval'}
                </button>
                <button
                  type="button"
                  onClick={openApprovalModal}
                  style={{ marginLeft: '0.5rem' }}
                >
                  View my requests
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {showApprovalControls && (
        <Modal
          open={approvalModalOpen}
          onClose={() => setApprovalModalOpen(false)}
          title="Report approvals"
          width="900px"
        >
          {approvalLoading ? (
            <p>Loading…</p>
          ) : (
            <div>
              {approvalError && (
                <p style={{ color: 'red' }}>{approvalError}</p>
              )}
              <section>
                <h4 style={{ marginTop: 0 }}>My requests</h4>
                {approvalData.outgoing.length === 0 ? (
                  <p>No report approval requests submitted.</p>
                ) : (
                  approvalData.outgoing.map((req) => {
                    const meta = req.report_metadata || req.proposed_data;
                    const statusLabel = req.status
                      ? req.status.charAt(0).toUpperCase() + req.status.slice(1)
                      : 'Pending';
                    return (
                      <details
                        key={req.request_id}
                        style={{ marginBottom: '1rem' }}
                      >
                        <summary>
                          {(meta?.procedure || 'Unknown procedure') +
                            ' — ' +
                            statusLabel}
                        </summary>
                        <div style={{ marginTop: '0.5rem' }}>
                          <div>
                            <strong>Requested:</strong> {formatDateTime(req.created_at)}
                          </div>
                          {req.responded_at && (
                            <div>
                              <strong>Responded:</strong> {formatDateTime(req.responded_at)}
                            </div>
                          )}
                          {req.request_reason && (
                            <div>
                              <strong>Reason:</strong> {req.request_reason}
                            </div>
                          )}
                          {req.response_notes && (
                            <div>
                              <strong>Response notes:</strong> {req.response_notes}
                            </div>
                          )}
                          <div style={{ marginTop: '0.5rem' }}>
                            {renderReportMetadata(meta)}
                          </div>
                        </div>
                      </details>
                    );
                  })
                )}
              </section>
              {canReviewApprovals && (
                <section style={{ marginTop: '1.5rem' }}>
                  <h4>Pending approvals</h4>
                  {approvalData.incoming.length === 0 ? (
                    <p>No pending report approvals.</p>
                  ) : (
                    approvalData.incoming.map((req) => {
                      const meta = req.report_metadata || req.proposed_data;
                      return (
                        <details
                          key={req.request_id}
                          style={{ marginBottom: '1rem' }}
                          open
                        >
                          <summary>
                            {(meta?.procedure || 'Unknown procedure') +
                              ' — Requested by ' +
                              (req.emp_id || 'unknown')}
                          </summary>
                          <div style={{ marginTop: '0.5rem' }}>
                            <div>
                              <strong>Requested:</strong> {formatDateTime(req.created_at)}
                            </div>
                            {req.request_reason && (
                              <div>
                                <strong>Reason:</strong> {req.request_reason}
                              </div>
                            )}
                            <div style={{ marginTop: '0.5rem' }}>
                              {renderReportMetadata(meta)}
                            </div>
                            <div style={{ marginTop: '0.75rem' }}>
                              <button
                                onClick={() => handleRespond(req, 'accepted')}
                                disabled={respondingRequestId === req.request_id}
                              >
                                {respondingRequestId === req.request_id
                                  ? 'Approving…'
                                  : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleRespond(req, 'declined')}
                                disabled={respondingRequestId === req.request_id}
                                style={{ marginLeft: '0.5rem' }}
                              >
                                {respondingRequestId === req.request_id
                                  ? 'Declining…'
                                  : 'Decline'}
                              </button>
                            </div>
                          </div>
                        </details>
                      );
                    })
                  )}
                </section>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

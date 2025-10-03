// src/erp.mgt.mn/pages/Reports.jsx
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import ReportTable from '../components/ReportTable.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import CustomDatePicker from '../components/CustomDatePicker.jsx';
import useButtonPerms from '../hooks/useButtonPerms.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';

export default function Reports() {
  const { company, branch, department, user, session } = useContext(AuthContext);
  const buttonPerms = useButtonPerms();
  const { addToast } = useToast();
  const generalConfig = useGeneralConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const [procedures, setProcedures] = useState([]);
  const [selectedProc, setSelectedProc] = useState('');
  const [procParams, setProcParams] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [result, setResult] = useState(null);
  const [manualParams, setManualParams] = useState({});
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [lockInfo, setLockInfo] = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [responding, setResponding] = useState(false);
  const [approvalContext, setApprovalContext] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState(null);
  const [hasLoadedApprovalResult, setHasLoadedApprovalResult] = useState(false);
  const procNames = useMemo(() => procedures.map((p) => p.name), [procedures]);
  const procMap = useHeaderMappings(procNames);

  const approvalRequestId = searchParams.get('request_id');
  const isSubordinate = Number(session?.senior_empid) > 0;
  const isSenior = Boolean(user?.empid) && !isSubordinate;

  const getLabel = useCallback(
    (name) =>
      generalConfig.general?.procLabels?.[name] || procMap[name] || name,
    [generalConfig.general?.procLabels, procMap],
  );

  const lockInfoMeta = useMemo(
    () => ({
      idField: lockInfo?.idField ?? null,
      tableField: lockInfo?.tableField ?? null,
      tableName: lockInfo?.tableName ?? null,
    }),
    [lockInfo?.idField, lockInfo?.tableField, lockInfo?.tableName],
  );

  const approvalTransactions = useMemo(() => {
    const raw = approvalContext?.proposed_data?.transactions;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((tx) => {
        if (!tx || typeof tx !== 'object') return null;
        const table =
          tx.table || tx.tableName || tx.sourceTable || lockInfoMeta.tableName || null;
        const recordValue =
          tx.recordId ?? tx.record_id ?? tx.id ?? tx.transactionId;
        if (
          !table ||
          recordValue === undefined ||
          recordValue === null ||
          recordValue === ''
        ) {
          return null;
        }
        return { table, recordId: String(recordValue) };
      })
      .filter(Boolean);
  }, [approvalContext, lockInfoMeta.tableName]);

  const handleTransactionsChange = useCallback((transactions) => {
    setSelectedTransactions(transactions || []);
  }, []);

  const handleTransactionMetadata = useCallback((meta) => {
    if (!meta) return;
    setLockInfo((info) => {
      const base = info || { pending: [], locked: [] };
      return {
        ...base,
        idField: meta.idField ?? base.idField ?? null,
        tableField: meta.tableField ?? base.tableField ?? null,
        tableName:
          meta.tableName !== undefined ? meta.tableName : base.tableName ?? null,
      };
    });
  }, []);

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
  }, [selectedProc]);

  useEffect(() => {
    if (!isSenior || !approvalRequestId || !user?.empid) {
      if (!approvalRequestId) {
        setApprovalContext(null);
        setApprovalError(null);
        setApprovalLoading(false);
      }
      return;
    }
    let cancelled = false;
    setApprovalLoading(true);
    setApprovalError(null);
    async function loadApprovalRequest() {
      try {
        const params = new URLSearchParams();
        params.set('request_type', 'report_approval');
        params.set('status', 'pending');
        params.set('senior_empid', user.empid);
        params.set('per_page', '50');
        const res = await fetch(`/api/pending_request?${params.toString()}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || 'Failed to load approval request');
        }
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const request = rows.find(
          (row) => String(row.request_id) === String(approvalRequestId),
        );
        if (cancelled) return;
        if (!request) {
          setApprovalError('Approval request not found.');
          setApprovalContext(null);
          return;
        }
        setApprovalContext(request);
        setPendingApproval(null);
      } catch (err) {
        if (cancelled) return;
        setApprovalError(
          err && err.message
            ? err.message
            : 'Failed to load approval request.',
        );
        setApprovalContext(null);
      } finally {
        if (!cancelled) setApprovalLoading(false);
      }
    }
    loadApprovalRequest();
    return () => {
      cancelled = true;
    };
  }, [isSenior, approvalRequestId, user?.empid]);

  useEffect(() => {
    if (!approvalContext?.proposed_data) return;
    const { procedure, parameters } = approvalContext.proposed_data;
    if (procedure) {
      setSelectedProc(procedure);
      setDatePreset('custom');
    }
    if (parameters && typeof parameters === 'object') {
      setManualParams(parameters);
      Object.entries(parameters).forEach(([key, value]) => {
        const lower = key.toLowerCase();
        if (lower.includes('start') || lower.includes('from')) {
          setStartDate(normalizeDateInput(String(value), 'YYYY-MM-DD'));
        } else if (lower.includes('end') || lower.includes('to')) {
          setEndDate(normalizeDateInput(String(value), 'YYYY-MM-DD'));
        }
      });
    }
    setSelectedTransactions(approvalTransactions);
    setLockInfo((info) => ({
      idField: info?.idField ?? lockInfoMeta.idField ?? null,
      tableField: info?.tableField ?? lockInfoMeta.tableField ?? null,
      tableName: info?.tableName ?? lockInfoMeta.tableName ?? null,
      pending: approvalTransactions,
      locked: [],
    }));
    setHasLoadedApprovalResult(false);
  }, [
    approvalContext,
    approvalTransactions,
    lockInfoMeta.idField,
    lockInfoMeta.tableField,
    lockInfoMeta.tableName,
  ]);

  useEffect(() => {
    if (!approvalContext) return;
    if (approvalContext.proposed_data?.procedure !== selectedProc) return;
    if (!allParamsProvided) return;
    if (hasLoadedApprovalResult) return;
    runReport();
    setHasLoadedApprovalResult(true);
  }, [
    approvalContext,
    selectedProc,
    allParamsProvided,
    hasLoadedApprovalResult,
    runReport,
  ]);

  useEffect(() => {
    if (!approvalContext) {
      setHasLoadedApprovalResult(false);
    }
  }, [approvalContext]);

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

  const normalizedTransactionsForRequest = useCallback(
    (transactions) => {
      if (!Array.isArray(transactions)) return [];
      return transactions
        .map((tx) => {
          if (!tx || typeof tx !== 'object') return null;
          const table = tx.table || lockInfoMeta.tableName || null;
          const recordId = tx.recordId;
          if (!table || !recordId) return null;
          return { table, recordId };
        })
        .filter(Boolean);
    },
    [lockInfoMeta.tableName],
  );

  const handleRequestApproval = useCallback(async () => {
    if (!result) {
      addToast('Run the report before requesting approval', 'error');
      return;
    }
    const normalizedTransactions = normalizedTransactionsForRequest(
      selectedTransactions,
    );
    if (!normalizedTransactions.length) {
      addToast('No transactions are available for approval', 'error');
      return;
    }
    const reason = window.prompt('Enter a reason for this approval request');
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      addToast('Approval reason is required', 'error');
      return;
    }

    const payload = {
      table_name: 'report_transaction_locks',
      record_id: `${selectedProc}:${Date.now()}`,
      request_type: 'report_approval',
      request_reason: trimmedReason,
      proposed_data: {
        procedure: selectedProc,
        parameters: result.params || {},
        transactions: normalizedTransactions,
      },
    };

    const previousLockInfo = lockInfo;
    setLockInfo((info) => ({
      idField: info?.idField ?? lockInfoMeta.idField ?? null,
      tableField: info?.tableField ?? lockInfoMeta.tableField ?? null,
      tableName: info?.tableName ?? lockInfoMeta.tableName ?? null,
      locked: info?.locked || [],
      pending: normalizedTransactions,
    }));
    setRequestingApproval(true);
    try {
      const res = await fetch('/api/pending_request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit approval request');
      }
      setPendingApproval({
        requestId: data.request_id,
        procedure: selectedProc,
        parameters: result.params || {},
        transactions: normalizedTransactions,
        reason: trimmedReason,
      });
      addToast('Approval request sent for review', 'success');
    } catch (err) {
      setLockInfo(previousLockInfo || null);
      addToast(
        err && err.message ? err.message : 'Failed to request approval',
        'error',
      );
    } finally {
      setRequestingApproval(false);
    }
  }, [
    result,
    normalizedTransactionsForRequest,
    selectedTransactions,
    addToast,
    lockInfo,
    lockInfoMeta.idField,
    lockInfoMeta.tableField,
    lockInfoMeta.tableName,
    selectedProc,
  ]);

  const handleApprovalResponse = useCallback(
    async (status) => {
      if (!approvalContext?.request_id) return;
      const promptText =
        status === 'accepted'
          ? 'Add approval notes'
          : 'Provide a reason for declining this approval';
      const notes = window.prompt(promptText);
      if (notes === null) return;
      const trimmed = notes.trim();
      if (!trimmed) {
        addToast('Response notes are required', 'error');
        return;
      }

      const transactions = approvalTransactions;
      const previousLockInfo = lockInfo;
      setLockInfo((info) => ({
        idField: info?.idField ?? lockInfoMeta.idField ?? null,
        tableField: info?.tableField ?? lockInfoMeta.tableField ?? null,
        tableName: info?.tableName ?? lockInfoMeta.tableName ?? null,
        pending: [],
        locked: status === 'accepted' ? transactions : [],
      }));
      setResponding(true);
      try {
        const res = await fetch(
          `/api/pending_request/${approvalContext.request_id}/respond`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              status: status === 'accepted' ? 'accepted' : 'declined',
              response_notes: trimmed,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || 'Failed to submit response');
        }
        addToast(
          status === 'accepted'
            ? 'Report approved successfully'
            : 'Report approval declined',
          'success',
        );
        setApprovalContext(null);
        setPendingApproval(null);
        setApprovalError(null);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('request_id');
          return next;
        }, { replace: true });
      } catch (err) {
        setLockInfo(previousLockInfo || null);
        addToast(
          err && err.message ? err.message : 'Failed to submit response',
          'error',
        );
      } finally {
        setResponding(false);
      }
    },
    [
      approvalContext?.request_id,
      approvalTransactions,
      addToast,
      lockInfo,
      lockInfoMeta.idField,
      lockInfoMeta.tableField,
      lockInfoMeta.tableName,
      setSearchParams,
    ],
  );

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
    setStartDate(normalizeDateInput(fmt(start), 'YYYY-MM-DD'));
    setEndDate(normalizeDateInput(fmt(end), 'YYYY-MM-DD'));
  }

  const runReport = useCallback(async () => {
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
        setResult({
          name: selectedProc,
          params: paramMap,
          rows,
          fieldTypeMap: data.fieldTypeMap || {},
        });
      } else {
        addToast('Failed to run procedure', 'error');
      }
    } catch {
      addToast('Failed to run procedure', 'error');
    }
  }, [
    selectedProc,
    allParamsProvided,
    procParams,
    finalParams,
    getLabel,
    addToast,
    branch,
    department,
  ]);

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
              <select
                value={datePreset}
                onChange={handlePresetChange}
                style={{ marginRight: '0.5rem' }}
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
              <CustomDatePicker
                value={startDate}
                onChange={(v) => {
                  setStartDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                  setDatePreset('custom');
                }}
              />
              <CustomDatePicker
                value={endDate}
                onChange={(v) => {
                  setEndDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                  setDatePreset('custom');
                }}
                style={{ marginLeft: '0.5rem' }}
              />
              {procParams.map((p, i) => {
                if (autoParams[i] !== null) return null;
                const val = manualParams[p] || '';
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
                  />
                );
              })}
              <button
                onClick={runReport}
                style={{ marginLeft: '0.5rem' }}
                disabled={!allParamsProvided}
              >
                Run
              </button>
              {isSubordinate && result && (
                <button
                  onClick={handleRequestApproval}
                  style={{ marginLeft: '0.5rem' }}
                  disabled={
                    requestingApproval ||
                    selectedTransactions.length === 0 ||
                    approvalContext !== null ||
                    !!pendingApproval
                  }
                >
                  {requestingApproval ? 'Requesting…' : 'Request Approval'}
                </button>
              )}
              {isSenior && approvalContext && (
                <>
                  <button
                    onClick={() => handleApprovalResponse('accepted')}
                    style={{ marginLeft: '0.5rem' }}
                    disabled={responding}
                  >
                    {responding ? 'Submitting…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleApprovalResponse('declined')}
                    style={{ marginLeft: '0.5rem' }}
                    disabled={responding}
                  >
                    Decline
                  </button>
                </>
              )}
            </div>
        )}
      </div>
      {pendingApproval && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            border: '1px solid #fcd34d',
            borderRadius: '0.5rem',
            background: '#fffbeb',
          }}
        >
          Pending approval request #{pendingApproval.requestId} for{' '}
          {getLabel(pendingApproval.procedure)} covering{' '}
          {pendingApproval.transactions?.length ?? 0} transaction
          {pendingApproval.transactions?.length === 1 ? '' : 's'}.
        </div>
      )}
      {isSenior && approvalRequestId && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            background: '#f9fafb',
          }}
        >
          {approvalLoading ? (
            <div>Loading approval request…</div>
          ) : approvalError ? (
            <div style={{ color: '#b91c1c' }}>{approvalError}</div>
          ) : approvalContext ? (
            <div>
              <h3 style={{ marginTop: 0 }}>
                Approval request #{approvalContext.request_id}
              </h3>
              <p>
                Requested by <strong>{approvalContext.emp_id}</strong> on{' '}
                {approvalContext.created_at || approvalContext.created_at_fmt ||
                  'N/A'}
              </p>
              <p>
                Reason: {approvalContext.request_reason || 'No reason provided'}
              </p>
              <p>
                Procedure: {getLabel(approvalContext.proposed_data?.procedure || '')}
              </p>
              {approvalContext.proposed_data?.parameters && (
                <div style={{ marginTop: '0.5rem' }}>
                  <strong>Parameters:</strong>
                  <ul style={{ marginTop: '0.25rem', paddingLeft: '1.25rem' }}>
                    {Object.entries(
                      approvalContext.proposed_data.parameters,
                    ).map(([key, value]) => (
                      <li key={key}>
                        {key}: {String(value)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {approvalTransactions.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <strong>Transactions:</strong>
                  <ul style={{ marginTop: '0.25rem', paddingLeft: '1.25rem' }}>
                    {approvalTransactions.map((tx, idx) => (
                      <li key={`${tx.table || 'table'}-${tx.recordId}-${idx}`}>
                        {tx.table || 'Unknown table'} #{tx.recordId}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div>No approval context loaded.</div>
          )}
        </div>
      )}
      {result && (
        <ReportTable
          procedure={result.name}
          params={result.params}
          rows={result.rows}
          buttonPerms={buttonPerms}
          fieldTypeMap={result.fieldTypeMap}
          lockInfo={lockInfo}
          onTransactionsChange={handleTransactionsChange}
          onTransactionMetadata={handleTransactionMetadata}
        />
      )}
    </div>
  );
}

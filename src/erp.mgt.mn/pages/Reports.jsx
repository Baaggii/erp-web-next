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
import ReportSnapshotViewer from '../components/ReportSnapshotViewer.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import CustomDatePicker from '../components/CustomDatePicker.jsx';
import useButtonPerms from '../hooks/useButtonPerms.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';
import Modal from '../components/Modal.jsx';

const DATE_PARAM_ALLOWLIST = new Set([
  'startdt',
  'enddt',
  'fromdt',
  'todt',
  'startdatetime',
  'enddatetime',
  'fromdatetime',
  'todatetime',
]);

function normalizeParamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isLikelyDateField(name) {
  const normalized = normalizeParamName(name);
  if (!normalized) return false;
  if (normalized.includes('date')) return true;
  if (DATE_PARAM_ALLOWLIST.has(normalized)) return true;
  return false;
}

function isStartDateParam(name) {
  if (!isLikelyDateField(name)) return false;
  const normalized = normalizeParamName(name);
  return normalized.includes('start') || normalized.includes('from');
}

function isEndDateParam(name) {
  if (!isLikelyDateField(name)) return false;
  const normalized = normalizeParamName(name);
  return normalized.includes('end') || normalized.includes('to');
}

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
  const [snapshot, setSnapshot] = useState(null);
  const [lockCandidates, setLockCandidates] = useState([]);
  const [lockSelections, setLockSelections] = useState({});
  const [lockExclusions, setLockExclusions] = useState({});
  const [pendingExclusion, setPendingExclusion] = useState(null);
  const [lockFetchPending, setLockFetchPending] = useState(false);
  const [lockFetchError, setLockFetchError] = useState('');
  const [lockAcknowledged, setLockAcknowledged] = useState(false);
  const [approvalReason, setApprovalReason] = useState('');
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalRefreshKey, setApprovalRefreshKey] = useState(0);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [approvalData, setApprovalData] = useState({ incoming: [], outgoing: [] });
  const [respondingRequestId, setRespondingRequestId] = useState(null);
  const [expandedTransactionDetails, setExpandedTransactionDetails] = useState({});
  const expandedTransactionDetailsRef = useRef(expandedTransactionDetails);
  const [requestLockDetailsState, setRequestLockDetailsState] = useState({});
  const requestLockDetailsRef = useRef(requestLockDetailsState);
  const presetSelectRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const manualInputRefs = useRef({});
  const runButtonRef = useRef(null);
  const procNames = useMemo(() => procedures.map((p) => p.name), [procedures]);
  const procMap = useHeaderMappings(procNames);
  useEffect(() => {
    expandedTransactionDetailsRef.current = expandedTransactionDetails;
  }, [expandedTransactionDetails]);
  useEffect(() => {
    requestLockDetailsRef.current = requestLockDetailsState;
  }, [requestLockDetailsState]);
  const lockParamSignature = useMemo(() => {
    if (!result || !Array.isArray(result.orderedParams)) return '';
    try {
      return JSON.stringify(result.orderedParams);
    } catch {
      return '';
    }
  }, [result]);

  const getCandidateKey = useCallback((candidate) => {
    if (!candidate || typeof candidate !== 'object') return '';
    if (candidate.key) return String(candidate.key);
    const table = candidate.tableName ?? candidate.table;
    const recordId =
      candidate.recordId ??
      candidate.record_id ??
      candidate.id ??
      candidate.recordID;
    if (table === undefined || table === null) return '';
    const normalizedTable = String(table);
    if (recordId === undefined || recordId === null) return `${normalizedTable}#`;
    return `${normalizedTable}#${recordId}`;
  }, []);

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
    setApprovalReason('');
    setSnapshot(null);
    setLockCandidates([]);
    setLockSelections({});
    setLockExclusions({});
    setPendingExclusion(null);
    setLockFetchError('');
    setLockFetchPending(false);
    setLockAcknowledged(false);
  }, [selectedProc]);

  useEffect(() => {
    let cancelled = false;
    setLockAcknowledged(false);
    if (!result || !result.name) {
      setLockCandidates([]);
      setLockSelections({});
      setLockExclusions({});
      setPendingExclusion(null);
      setLockFetchError('');
      setLockFetchPending(false);
      return () => {
        cancelled = true;
      };
    }
    async function fetchLockCandidates() {
      setLockFetchPending(true);
      setLockFetchError('');
      const params = new URLSearchParams();
      if (branch) params.set('branchId', branch);
      if (department) params.set('departmentId', department);
      try {
        const res = await fetch(
          `/api/procedures/locks${
            params.toString() ? `?${params.toString()}` : ''
          }`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              name: result.name,
              params: Array.isArray(result.orderedParams)
                ? result.orderedParams
                : [],
            }),
          },
        );
        if (!res.ok) {
          throw new Error('Failed to load lock candidates');
        }
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data.lockCandidates)
          ? data.lockCandidates
          : [];
        const normalized = list
          .map((candidate) => {
            if (!candidate || typeof candidate !== 'object') return null;
            const tableName =
              typeof candidate.tableName === 'string'
                ? candidate.tableName
                : typeof candidate.table === 'string'
                ? candidate.table
                : null;
            const rawId =
              candidate.recordId ??
              candidate.record_id ??
              candidate.id ??
              candidate.recordID;
            if (!tableName || rawId === null || rawId === undefined) {
              return null;
            }
            const recordId = String(rawId);
            const key = candidate.key ?? `${tableName}#${recordId}`;
            const next = { ...candidate, tableName, recordId, key };
            if (candidate.table === undefined) next.table = tableName;
            return next;
          })
          .filter(Boolean);
        if (cancelled) return;
        setLockCandidates(normalized);
        const initialSelections = {};
        normalized.forEach((candidate) => {
          const key = getCandidateKey(candidate);
          if (!key) return;
          if (candidate?.locked) {
            initialSelections[key] = false;
          } else {
            initialSelections[key] = true;
          }
        });
        setLockSelections(initialSelections);
        setLockFetchError('');
      } catch (err) {
        if (cancelled) return;
        setLockCandidates([]);
        setLockSelections({});
        setLockExclusions({});
        setPendingExclusion(null);
        setLockFetchError(err?.message || 'Failed to load lock candidates');
      } finally {
        if (!cancelled) {
          setLockFetchPending(false);
        }
      }
    }
    fetchLockCandidates();
    return () => {
      cancelled = true;
    };
  }, [
    result,
    lockParamSignature,
    branch,
    department,
    getCandidateKey,
  ]);

  const dateParamInfo = useMemo(() => {
    const info = {
      hasStartParam: false,
      hasEndParam: false,
      managedIndices: new Set(),
      startIndices: new Set(),
      endIndices: new Set(),
    };
    procParams.forEach((param, index) => {
      if (typeof param !== 'string') return;
      if (isStartDateParam(param)) {
        info.hasStartParam = true;
        info.managedIndices.add(index);
        info.startIndices.add(index);
      }
      if (isEndDateParam(param)) {
        info.hasEndParam = true;
        info.managedIndices.add(index);
        info.endIndices.add(index);
      }
    });
    return info;
  }, [procParams]);

  const { hasStartParam, hasEndParam, managedIndices, startIndices, endIndices } =
    dateParamInfo;
  const hasDateParams = hasStartParam || hasEndParam;

  const autoParams = useMemo(() => {
    return procParams.map((p, index) => {
      if (startIndices.has(index)) return startDate || null;
      if (endIndices.has(index)) return endDate || null;
      const name = typeof p === 'string' ? p.toLowerCase() : '';
      if (name.includes('branch')) return branch ?? null;
      if (name.includes('department')) return department ?? null;
      if (name.includes('company')) return company ?? null;
      if (name.includes('user') || name.includes('emp')) return user?.empid ?? null;
      return null;
    });
  }, [
    procParams,
    startIndices,
    endIndices,
    startDate,
    endDate,
    company,
    branch,
    department,
    user,
  ]);

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
        setApprovalReason('');
        setSnapshot(null);
        setLockCandidates([]);
        setLockSelections({});
        setLockExclusions({});
        setPendingExclusion(null);
        setLockFetchError('');
        setLockFetchPending(false);
        setLockAcknowledged(false);
        setResult({
          name: selectedProc,
          params: paramMap,
          rows,
          fieldTypeMap: data.fieldTypeMap || {},
          orderedParams: finalParams,
        });
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

  const selectedLockCount = useMemo(() => {
    if (!Array.isArray(lockCandidates) || lockCandidates.length === 0)
      return 0;
    return lockCandidates.reduce((count, candidate) => {
      if (candidate?.locked) return count;
      const key = getCandidateKey(candidate);
      return lockSelections[key] ? count + 1 : count;
    }, 0);
  }, [lockCandidates, lockSelections, getCandidateKey]);

  const eligibleLockCount = useMemo(() => {
    if (!Array.isArray(lockCandidates) || lockCandidates.length === 0) {
      return 0;
    }
    return lockCandidates.reduce(
      (count, candidate) => (candidate?.locked ? count : count + 1),
      0,
    );
  }, [lockCandidates]);

  const lockedCandidateCount = useMemo(() => {
    if (!Array.isArray(lockCandidates) || lockCandidates.length === 0) {
      return 0;
    }
    return lockCandidates.reduce(
      (count, candidate) => (candidate?.locked ? count + 1 : count),
      0,
    );
  }, [lockCandidates]);

  const allLocksSelected = useMemo(() => {
    if (!Array.isArray(lockCandidates) || lockCandidates.length === 0) {
      return false;
    }
    const eligible = lockCandidates.filter((candidate) => !candidate?.locked);
    if (!eligible.length) return false;
    return eligible.every((candidate) =>
      lockSelections[getCandidateKey(candidate)],
    );
  }, [lockCandidates, lockSelections, getCandidateKey]);

  const showLockDetails = useMemo(
    () =>
      lockCandidates.some(
        (candidate) => candidate?.label || candidate?.description,
      ),
    [lockCandidates],
  );

  const toggleAllLocks = useCallback(
    (checked) => {
      if (!checked) {
        addToast(
          'Clear individual checkboxes to exclude transactions and provide a justification.',
          'error',
        );
        return;
      }
      setLockSelections((prev) => {
        const next = { ...prev };
        lockCandidates.forEach((candidate) => {
          const key = getCandidateKey(candidate);
          if (!key) return;
          if (candidate?.locked) {
            next[key] = false;
            return;
          }
          next[key] = true;
        });
        return next;
      });
      setLockExclusions((prev) => {
        if (!prev || Object.keys(prev).length === 0) return prev;
        const next = { ...prev };
        let changed = false;
        lockCandidates.forEach((candidate) => {
          const key = getCandidateKey(candidate);
          if (key && next[key]) {
            delete next[key];
            changed = true;
          }
        });
        if (!changed) return prev;
        return next;
      });
    },
    [addToast, lockCandidates, getCandidateKey],
  );

  const lockBuckets = useMemo(() => {
    if (!Array.isArray(lockCandidates) || lockCandidates.length === 0) {
      return [];
    }
    const bucketMap = new Map();
    lockCandidates.forEach((candidate) => {
      const tableName = candidate?.tableName ?? candidate?.table;
      if (!tableName) return;
      if (!bucketMap.has(tableName)) {
        bucketMap.set(tableName, { tableName, candidates: [] });
      }
      bucketMap.get(tableName).candidates.push(candidate);
    });
    const buckets = Array.from(bucketMap.values()).sort((a, b) =>
      String(a.tableName).localeCompare(String(b.tableName)),
    );
    return buckets.map((bucket) => {
      const sortedCandidates = [...bucket.candidates].sort((a, b) =>
        String(a?.recordId ?? '').localeCompare(String(b?.recordId ?? '')),
      );
      const columnSet = new Set();
      sortedCandidates.forEach((candidate) => {
        if (Array.isArray(candidate?.snapshotColumns)) {
          candidate.snapshotColumns.forEach((col) => {
            if (col) columnSet.add(col);
          });
        } else if (
          candidate?.snapshot &&
          typeof candidate.snapshot === 'object' &&
          candidate.snapshot !== null
        ) {
          Object.keys(candidate.snapshot).forEach((col) => {
            if (col) columnSet.add(col);
          });
        }
      });
      return {
        tableName: bucket.tableName,
        candidates: sortedCandidates,
        columns: Array.from(columnSet),
      };
    });
  }, [lockCandidates]);

  const lockCandidateMap = useMemo(() => {
    const map = new Map();
    lockCandidates.forEach((candidate) => {
      const key = getCandidateKey(candidate);
      if (key) {
        map.set(key, candidate);
      }
    });
    return map;
  }, [lockCandidates, getCandidateKey]);

  useEffect(() => {
    setLockExclusions((prev) => {
      if (!prev || Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([key, info]) => {
        const candidate = lockCandidateMap.get(key);
        if (!candidate) {
          changed = true;
          return;
        }
        const updatedInfo = {
          ...info,
          table:
            candidate?.tableName ??
            candidate?.table ??
            info.table ??
            '',
          recordId: String(
            candidate?.recordId ?? candidate?.id ?? info.recordId ?? '',
          ),
          label: candidate?.label ?? info.label ?? '',
          description: candidate?.description ?? info.description ?? '',
        };
        if (
          updatedInfo.table !== info.table ||
          updatedInfo.recordId !== info.recordId ||
          updatedInfo.label !== info.label ||
          updatedInfo.description !== info.description
        ) {
          changed = true;
        }
        next[key] = updatedInfo;
      });
      if (!changed) return prev;
      return next;
    });
  }, [lockCandidateMap]);

  useEffect(() => {
    if (!pendingExclusion) return;
    const candidate = lockCandidateMap.get(pendingExclusion.key);
    if (!candidate) {
      setPendingExclusion(null);
      return;
    }
    if (candidate !== pendingExclusion.candidate) {
      setPendingExclusion((prev) =>
        prev ? { ...prev, candidate } : prev,
      );
    }
  }, [pendingExclusion, lockCandidateMap]);

  const updateLockSelection = useCallback(
    (key, checked) => {
      setLockSelections((prev) => ({ ...prev, [key]: checked }));
      if (checked) {
        setLockExclusions((prev) => {
          if (!prev || !prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [],
  );

  const handleLockCheckboxChange = useCallback(
    (candidate, checked) => {
      const key = getCandidateKey(candidate);
      if (!key) return;
      if (candidate?.locked) return;
      if (checked) {
        updateLockSelection(key, true);
        return;
      }
      const existingReason = lockExclusions[key]?.reason || '';
      setPendingExclusion({
        key,
        candidate,
        reason: existingReason,
        error: '',
      });
    },
    [getCandidateKey, lockExclusions, updateLockSelection],
  );

  const handleEditExclusion = useCallback(
    (key) => {
      const candidate = lockCandidateMap.get(key);
      if (!candidate) return;
      const existingReason = lockExclusions[key]?.reason || '';
      setPendingExclusion({ key, candidate, reason: existingReason, error: '' });
    },
    [lockCandidateMap, lockExclusions],
  );

  const confirmPendingExclusion = useCallback(() => {
    if (!pendingExclusion) return;
    const trimmed = pendingExclusion.reason.trim();
    if (!trimmed) {
      setPendingExclusion((prev) =>
        prev ? { ...prev, error: 'Reason is required.' } : prev,
      );
      return;
    }
    updateLockSelection(pendingExclusion.key, false);
    setLockExclusions((prev) => ({
      ...prev,
      [pendingExclusion.key]: {
        reason: trimmed,
        table:
          pendingExclusion.candidate?.tableName ??
          pendingExclusion.candidate?.table ??
          '',
        recordId: String(
          pendingExclusion.candidate?.recordId ??
            pendingExclusion.candidate?.id ??
            '',
        ),
        label: pendingExclusion.candidate?.label ?? '',
        description: pendingExclusion.candidate?.description ?? '',
      },
    }));
    setPendingExclusion(null);
  }, [pendingExclusion, updateLockSelection]);

  const cancelPendingExclusion = useCallback(() => {
    setPendingExclusion(null);
  }, []);

  const updatePendingExclusionReason = useCallback((value) => {
    setPendingExclusion((prev) =>
      prev ? { ...prev, reason: value, error: '' } : prev,
    );
  }, []);

  const excludedLockCount = useMemo(() => {
    if (!Array.isArray(lockCandidates) || lockCandidates.length === 0) {
      return 0;
    }
    return lockCandidates.reduce((count, candidate) => {
      if (candidate?.locked) return count;
      const key = getCandidateKey(candidate);
      return lockSelections[key] ? count : count + 1;
    }, 0);
  }, [lockCandidates, lockSelections, getCandidateKey]);

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
    if (!snapshotData || typeof snapshotData !== 'object') {
      return <p style={{ marginTop: '0.25rem' }}>No snapshot captured.</p>;
    }
    return (
      <ReportSnapshotViewer
        snapshot={snapshotData}
        emptyMessage="No snapshot captured."
        formatValue={(value, column, fieldTypes) =>
          formatSnapshotCell(value, column, fieldTypes)
        }
      />
    );
  }

  function renderCandidateSnapshot(candidate, fallbackColumns = []) {
    const snapshot = candidate?.snapshot;
    if (!snapshot || typeof snapshot !== 'object') {
      return (
        <p style={{ margin: '0.25rem 0 0' }}>Snapshot unavailable.</p>
      );
    }
    const explicitColumns = Array.isArray(candidate?.snapshotColumns)
      ? candidate.snapshotColumns.filter(Boolean)
      : [];
    const columns =
      explicitColumns.length > 0
        ? explicitColumns
        : fallbackColumns.length > 0
        ? fallbackColumns
        : Object.keys(snapshot);
    if (!columns.length) {
      return (
        <p style={{ margin: '0.25rem 0 0' }}>Snapshot unavailable.</p>
      );
    }
    const fieldTypes =
      candidate?.snapshotFieldTypeMap || candidate?.fieldTypeMap || {};
    return (
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
        }}
      >
        <tbody>
          {columns.map((col) => (
            <tr key={col}>
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.25rem',
                  border: '1px solid #d1d5db',
                  background: '#f3f4f6',
                  width: '35%',
                }}
              >
                {col}
              </th>
              <td
                style={{
                  padding: '0.25rem',
                  border: '1px solid #d1d5db',
                }}
              >
                {formatSnapshotCell(snapshot?.[col], col, fieldTypes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const ensureRequestLockDetails = useCallback(
    async (requestId) => {
      if (requestId === undefined || requestId === null) return null;
      const normalizedId = String(requestId);
      const existing = requestLockDetailsRef.current[normalizedId];
      if (existing?.status === 'loaded' || existing?.status === 'loading') {
        return existing;
      }
      setRequestLockDetailsState((prev) => ({
        ...prev,
        [normalizedId]: {
          status: 'loading',
          locks: [],
          lookup: {},
          error: '',
        },
      }));
      try {
        const res = await fetch(
          `/api/report_approvals/${encodeURIComponent(normalizedId)}/locks`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          throw new Error('Failed to load transaction details');
        }
        const data = await res.json().catch(() => ({}));
        const rawLocks = Array.isArray(data?.locks)
          ? data.locks
          : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.transactions)
          ? data.transactions
          : Array.isArray(data)
          ? data
          : [];
        const normalizedLocks = rawLocks
          .map((lock) => {
            if (!lock || typeof lock !== 'object') return null;
            const tableName =
              lock.tableName ??
              lock.table ??
              lock.table_name ??
              '';
            const rawId =
              lock.recordId ??
              lock.record_id ??
              lock.id ??
              lock.recordID;
            if (!tableName || rawId === undefined || rawId === null) {
              return null;
            }
            const recordId = String(rawId);
            const key = `${tableName}#${recordId}`;
            let snapshotColumns = Array.isArray(lock.snapshotColumns)
              ? lock.snapshotColumns.filter(Boolean)
              : Array.isArray(lock.columns)
              ? lock.columns.filter(Boolean)
              : [];
            let fieldTypeMap =
              lock.snapshotFieldTypeMap || lock.fieldTypeMap || {};
            let snapshot = null;
            if (lock.snapshot && typeof lock.snapshot === 'object') {
              if (Array.isArray(lock.snapshot.rows)) {
                const row = lock.snapshot.rows[0];
                if (row && typeof row === 'object') {
                  snapshot = row;
                  if (!snapshotColumns.length) {
                    if (
                      Array.isArray(lock.snapshot.columns) &&
                      lock.snapshot.columns.length
                    ) {
                      snapshotColumns = lock.snapshot.columns.filter(Boolean);
                    } else {
                      snapshotColumns = Object.keys(row);
                    }
                  }
                  if (!fieldTypeMap || Object.keys(fieldTypeMap).length === 0) {
                    fieldTypeMap = lock.snapshot.fieldTypeMap || {};
                  }
                }
              } else {
                snapshot = lock.snapshot;
              }
            } else if (
              lock.row &&
              typeof lock.row === 'object' &&
              !Array.isArray(lock.row)
            ) {
              snapshot = lock.row;
            }
            return {
              key,
              tableName,
              recordId,
              snapshot,
              snapshotColumns,
              snapshotFieldTypeMap: fieldTypeMap || {},
            };
          })
          .filter(Boolean);
        const lookup = normalizedLocks.reduce((acc, lock) => {
          acc[lock.key] = lock;
          return acc;
        }, {});
        const value = {
          status: 'loaded',
          locks: normalizedLocks,
          lookup,
          error: '',
        };
        setRequestLockDetailsState((prev) => ({
          ...prev,
          [normalizedId]: value,
        }));
        return value;
      } catch (err) {
        const message = err?.message || 'Failed to load transaction details';
        const value = {
          status: 'error',
          locks: [],
          lookup: {},
          error: message,
        };
        setRequestLockDetailsState((prev) => ({
          ...prev,
          [normalizedId]: value,
        }));
        return value;
      }
    },
    [],
  );

  const handleTransactionDetailsToggle = useCallback(
    async (detailKey, requestId, shouldFetch = true) => {
      const nextOpen = !expandedTransactionDetailsRef.current[detailKey];
      setExpandedTransactionDetails((prev) => ({
        ...prev,
        [detailKey]: nextOpen,
      }));
      if (nextOpen && requestId !== undefined && requestId !== null && shouldFetch) {
        await ensureRequestLockDetails(requestId);
      }
    },
    [ensureRequestLockDetails],
  );

  function renderReportMetadata(meta, options = {}) {
    if (!meta) {
      return <p>No report metadata available.</p>;
    }
    const paramEntries = Object.entries(meta.parameters || {});
    const transactions = Array.isArray(meta.transactions)
      ? meta.transactions
      : Array.isArray(meta.transaction_list)
      ? meta.transaction_list
      : [];
    const excludedTransactions = Array.isArray(meta.excludedTransactions)
      ? meta.excludedTransactions
      : Array.isArray(meta.excluded_transactions)
      ? meta.excluded_transactions
      : [];
    const rowCount =
      typeof meta.snapshot?.rowCount === 'number'
        ? meta.snapshot.rowCount
        : Array.isArray(meta.snapshot?.rows)
        ? meta.snapshot.rows.length
        : null;
    const requestId =
      options.requestId ??
      meta.requestId ??
      meta.request_id ??
      meta.lockRequestId ??
      null;

    function normalizeTransaction(tx) {
      if (!tx || typeof tx !== 'object') return null;
      const tableName =
        tx.table || tx.tableName || tx.table_name || '—';
      const rawId =
        tx.recordId ?? tx.record_id ?? tx.id ?? tx.recordID ?? tx.RecordId;
      if (!tableName || rawId === undefined || rawId === null) return null;
      const recordId = String(rawId);
      const key = `${tableName}#${recordId}`;
      const label = tx.label || tx.description || tx.note || '';
      const reason =
        tx.reason || tx.justification || tx.explanation || tx.exclude_reason || '';
      const snapshot =
        tx.snapshot && typeof tx.snapshot === 'object' ? tx.snapshot : null;
      const snapshotColumns = Array.isArray(tx.snapshotColumns)
        ? tx.snapshotColumns.filter(Boolean)
        : Array.isArray(tx.columns)
        ? tx.columns.filter(Boolean)
        : [];
      const snapshotFieldTypeMap =
        tx.snapshotFieldTypeMap || tx.fieldTypeMap || {};
      return {
        key,
        tableName,
        recordId,
        label,
        reason,
        snapshot,
        snapshotColumns,
        snapshotFieldTypeMap,
      };
    }

    function buildBuckets(list) {
      if (!Array.isArray(list) || list.length === 0) return [];
      const map = new Map();
      list.forEach((item) => {
        if (!item) return;
        const bucketKey = item.tableName || '—';
        if (!map.has(bucketKey)) {
          map.set(bucketKey, []);
        }
        map.get(bucketKey).push(item);
      });
      return Array.from(map.entries())
        .map(([tableName, records]) => ({
          tableName,
          records: records
            .slice()
            .sort((a, b) => String(a.recordId).localeCompare(String(b.recordId))),
        }))
        .sort((a, b) => String(a.tableName).localeCompare(String(b.tableName)));
    }

    const normalizedTransactions = transactions
      .map((tx) => normalizeTransaction(tx))
      .filter(Boolean);
    const normalizedExcluded = excludedTransactions
      .map((tx) => normalizeTransaction(tx))
      .filter(Boolean);
    const transactionBuckets = buildBuckets(normalizedTransactions);
    const excludedBuckets = buildBuckets(normalizedExcluded);

    const renderExpandedContent = (record) => {
      if (record.snapshot && typeof record.snapshot === 'object') {
        return (
          <div style={{ marginTop: '0.25rem' }}>
            {renderCandidateSnapshot(record, record.snapshotColumns || [])}
          </div>
        );
      }
      if (requestId === null || requestId === undefined) {
        return (
          <p style={{ margin: '0.25rem 0 0' }}>
            Additional details unavailable without an approval request.
          </p>
        );
      }
      const entry = requestLockDetailsState[String(requestId)];
      if (!entry || entry.status === 'loading') {
        return <p style={{ margin: '0.25rem 0 0' }}>Loading details…</p>;
      }
      if (entry.status === 'error') {
        return (
          <p style={{ margin: '0.25rem 0 0' }}>
            {entry.error || 'Failed to load details.'}
          </p>
        );
      }
      const candidate =
        entry.lookup?.[record.key] ||
        entry.locks?.find((lock) => lock.key === record.key);
      if (
        candidate &&
        candidate.snapshot &&
        typeof candidate.snapshot === 'object'
      ) {
        const fallbackColumns = Array.isArray(candidate.snapshotColumns)
          ? candidate.snapshotColumns
          : record.snapshotColumns || [];
        return (
          <div style={{ marginTop: '0.25rem' }}>
            {renderCandidateSnapshot(candidate, fallbackColumns)}
          </div>
        );
      }
      return (
        <p style={{ margin: '0.25rem 0 0' }}>
          No additional details found for this record.
        </p>
      );
    };

    const renderBucket = (bucket, listType) => {
      const count = bucket.records.length;
      const summary = `${bucket.tableName} — ${count} transaction${
        count === 1 ? '' : 's'
      }`;
      const shouldDefaultOpen =
        listType === 'selected'
          ? transactionBuckets.length === 1
          : excludedBuckets.length === 1;
      return (
        <details
          key={`${listType}-${bucket.tableName}`}
          style={{ margin: '0.25rem 0' }}
          defaultOpen={shouldDefaultOpen}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
            {summary}
          </summary>
          <ul style={{ margin: '0.25rem 0 0 1.25rem' }}>
            {bucket.records.map((record) => {
              const detailKey = `${requestId ?? 'meta'}|${listType}|${record.key}`;
              const isExpanded = Boolean(expandedTransactionDetails[detailKey]);
              const hasSnapshot = Boolean(record.snapshot);
              const hasRequestContext =
                requestId !== null && requestId !== undefined;
              const canToggle = hasSnapshot || hasRequestContext;
              return (
                <li key={detailKey} style={{ margin: '0.5rem 0' }}>
                  <div>
                    <span style={{ fontWeight: 'bold' }}>#{record.recordId}</span>
                    {record.label && ` — ${record.label}`}
                  </div>
                  {record.reason && (
                    <div style={{ marginTop: '0.25rem' }}>
                      {listType === 'excluded' ? 'Reason: ' : ''}
                      {record.reason}
                    </div>
                  )}
                  {canToggle && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() =>
                          handleTransactionDetailsToggle(
                            detailKey,
                            hasRequestContext ? requestId : null,
                            !hasSnapshot,
                          )
                        }
                        style={{ fontSize: '0.85rem' }}
                      >
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                    </div>
                  )}
                  {isExpanded && renderExpandedContent(record)}
                </li>
              );
            })}
          </ul>
        </details>
      );
    };

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
          {transactionBuckets.length ? (
            <div style={{ margin: '0.25rem 0 0' }}>
              {transactionBuckets.map((bucket) =>
                renderBucket(bucket, 'selected'),
              )}
            </div>
          ) : (
            <p style={{ margin: '0.25rem 0 0' }}>No transactions selected.</p>
          )}
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <strong>Excluded transactions</strong>
          {excludedBuckets.length ? (
            <div style={{ margin: '0.25rem 0 0' }}>
              {excludedBuckets.map((bucket) => renderBucket(bucket, 'excluded'))}
            </div>
          ) : (
            <p style={{ margin: '0.25rem 0 0' }}>No transactions excluded.</p>
          )}
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <strong>Snapshot</strong>
          {renderSnapshotTable(meta.snapshot)}
        </div>
      </div>
    );
  }

  const openApprovalModal = useCallback(() => {
    setApprovalError('');
    setApprovalLoading(true);
    setApprovalModalOpen(true);
    setApprovalRefreshKey((k) => k + 1);
  }, []);

  async function handleRequestApproval() {
    if (!canRequestApproval) return;
    if (!result) {
      addToast('Run a report before requesting approval', 'error');
      return;
    }
    if (lockFetchPending) {
      addToast('Lock candidates are still loading', 'error');
      return;
    }
    if (!selectedLockCount) {
      addToast('Add at least one transaction to request approval', 'error');
      return;
    }
    if (!lockAcknowledged) {
      addToast(
        'You must acknowledge responsibility for the listed transactions',
        'error',
      );
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
    const excludedTransactions = lockCandidates
      .filter((candidate) => !candidate?.locked)
      .filter((candidate) => !lockSelections[getCandidateKey(candidate)])
      .map((candidate) => {
        const key = getCandidateKey(candidate);
        const info = lockExclusions[key];
        return {
          table: candidate.tableName,
          recordId: String(candidate.recordId),
          reason: info?.reason?.trim() || '',
        };
      });
    if (excludedTransactions.some((tx) => !tx.reason)) {
      addToast('Provide a reason for each excluded transaction', 'error');
      return;
    }
    const proposedData = {
      procedure: snapshot?.procedure || result.name,
      parameters: snapshot?.params || result.params,
      transactions: lockCandidates
        .filter((candidate) => lockSelections[getCandidateKey(candidate)])
        .map((candidate) => ({
          table: candidate.tableName,
          recordId: String(candidate.recordId),
        })),
      excludedTransactions,
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
      setApprovalReason('');
      setLockAcknowledged(false);
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
        if (!errorMsg) {
          setApprovalData({ incoming: incomingRows, outgoing: outgoingRows });
        }
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
              <div style={{ marginTop: '0.75rem' }}>
                <strong>Transactions marked for locking</strong>
                {lockFetchPending ? (
                  <p style={{ marginTop: '0.5rem' }}>Loading lock candidates…</p>
                ) : lockFetchError ? (
                  <p style={{ marginTop: '0.5rem', color: 'red' }}>
                    {lockFetchError}
                  </p>
                ) : lockBuckets.length ? (
                  <>
                    {eligibleLockCount > 0 ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={allLocksSelected}
                            onChange={(e) => toggleAllLocks(e.target.checked)}
                            disabled={eligibleLockCount === 0}
                          />
                          <span>
                            Select all eligible transactions ({selectedLockCount}/
                            {eligibleLockCount})
                          </span>
                        </label>
                      </div>
                    ) : (
                      <p style={{ marginTop: '0.5rem' }}>
                        No eligible transactions are available for locking.
                      </p>
                    )}
                    {lockedCandidateCount > 0 && (
                      <p style={{ marginTop: '0.5rem', color: '#b45309' }}>
                        {lockedCandidateCount} transaction
                        {lockedCandidateCount === 1 ? '' : 's'} already locked and
                        cannot be selected.
                      </p>
                    )}
                    {excludedLockCount > 0 && (
                      <p style={{ marginTop: '0.5rem' }}>
                        {excludedLockCount} transaction
                        {excludedLockCount === 1 ? '' : 's'} excluded from locking
                        with justification.
                      </p>
                    )}
                    <div style={{ marginTop: '0.75rem' }}>
                      {lockBuckets.map((bucket, idx) => {
                        const bucketEligibleCount = bucket.candidates.reduce(
                          (count, candidate) =>
                            candidate?.locked ? count : count + 1,
                          0,
                        );
                        return (
                          <details
                            key={bucket.tableName || idx}
                            style={{
                              marginBottom: '0.75rem',
                              background: '#ffffff',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.5rem',
                              padding: '0.5rem 0.75rem',
                            }}
                            open={lockBuckets.length === 1}
                          >
                            <summary
                              style={{ cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              {bucket.tableName} — {bucket.candidates.length}{' '}
                              transaction
                              {bucket.candidates.length === 1 ? '' : 's'}
                              {bucketEligibleCount !== bucket.candidates.length && (
                                <span
                                  style={{
                                    fontWeight: 'normal',
                                    marginLeft: '0.25rem',
                                  }}
                                >
                                  ({bucketEligibleCount} eligible)
                                </span>
                              )}
                            </summary>
                            <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                              <table
                                style={{
                                  borderCollapse: 'collapse',
                                  width: '100%',
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
                                      Lock
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
                                    {showLockDetails && (
                                      <th
                                        style={{
                                          textAlign: 'left',
                                          padding: '0.25rem',
                                          border: '1px solid #d1d5db',
                                        }}
                                      >
                                        Details
                                      </th>
                                    )}
                                    <th
                                      style={{
                                        textAlign: 'left',
                                        padding: '0.25rem',
                                        border: '1px solid #d1d5db',
                                      }}
                                    >
                                      Status
                                    </th>
                                    <th
                                      style={{
                                        textAlign: 'left',
                                        padding: '0.25rem',
                                        border: '1px solid #d1d5db',
                                      }}
                                    >
                                      Snapshot
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bucket.candidates.map((candidate) => {
                                    const key = getCandidateKey(candidate);
                                    const locked = Boolean(candidate?.locked);
                                    const checked = locked
                                      ? false
                                      : Boolean(lockSelections[key]);
                                    const exclusionInfo = lockExclusions[key];
                                    const detailText = candidate?.label
                                      ? candidate?.description
                                        ? `${candidate.label} — ${candidate.description}`
                                        : candidate.label
                                      : candidate?.description || '';
                                    const statusLabel = candidate?.lockStatus
                                      ? candidate.lockStatus
                                          .charAt(0)
                                          .toUpperCase() +
                                        candidate.lockStatus.slice(1)
                                      : '';
                                    let statusColor = '#047857';
                                    let statusText = 'Will lock';
                                    let statusDetails = 'Selectable for approval';
                                    if (locked) {
                                      statusColor = '#b91c1c';
                                      statusText = `Locked${
                                        statusLabel ? ` (${statusLabel})` : ''
                                      }`;
                                      statusDetails = `Locked by ${
                                        candidate?.lockedBy || 'unknown'
                                      }${
                                        candidate?.lockedAt
                                          ? ` on ${formatDateTime(candidate.lockedAt)}`
                                          : ''
                                      }`;
                                    } else if (!checked) {
                                      statusColor = '#92400e';
                                      statusText = 'Excluded from locking';
                                      statusDetails =
                                        exclusionInfo?.reason
                                          ? `Reason: ${exclusionInfo.reason}`
                                          : 'Provide a reason to exclude this transaction.';
                                    }
                                    return (
                                      <tr
                                        key={
                                          key ||
                                          `${bucket.tableName}-${candidate.recordId}`
                                        }
                                      >
                                        <td
                                          style={{
                                            padding: '0.25rem',
                                            border: '1px solid #d1d5db',
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={locked}
                                            onChange={(e) =>
                                              handleLockCheckboxChange(
                                                candidate,
                                                e.target.checked,
                                              )
                                            }
                                          />
                                        </td>
                                        <td
                                          style={{
                                            padding: '0.25rem',
                                            border: '1px solid #d1d5db',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {candidate.recordId}
                                        </td>
                                        {showLockDetails && (
                                          <td
                                            style={{
                                              padding: '0.25rem',
                                              border: '1px solid #d1d5db',
                                            }}
                                          >
                                            {detailText || '—'}
                                          </td>
                                        )}
                                        <td
                                          style={{
                                            padding: '0.25rem',
                                            border: '1px solid #d1d5db',
                                            minWidth: '12rem',
                                          }}
                                        >
                                          <div
                                            style={{
                                              color: statusColor,
                                              fontWeight: 'bold',
                                            }}
                                          >
                                            {statusText}
                                          </div>
                                          <div
                                            style={{
                                              marginTop: '0.125rem',
                                              fontSize: '0.875rem',
                                            }}
                                          >
                                            {statusDetails}
                                          </div>
                                          {!locked && !checked && key && (
                                            <div style={{ marginTop: '0.5rem' }}>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleEditExclusion(key)
                                                }
                                                style={{ fontSize: '0.85rem' }}
                                              >
                                                Edit reason
                                              </button>
                                            </div>
                                          )}
                                        </td>
                                        <td
                                          style={{
                                            padding: '0.25rem',
                                            border: '1px solid #d1d5db',
                                            minWidth: '10rem',
                                          }}
                                        >
                                          {candidate?.snapshot ? (
                                            <details>
                                              <summary
                                                style={{ cursor: 'pointer' }}
                                              >
                                                View snapshot
                                              </summary>
                                              <div style={{ marginTop: '0.25rem' }}>
                                                {renderCandidateSnapshot(
                                                  candidate,
                                                  bucket.columns,
                                                )}
                                              </div>
                                            </details>
                                          ) : (
                                            <span>—</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p style={{ marginTop: '0.5rem' }}>
                    No transactions were reported for locking.
                  </p>
                )}
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={lockAcknowledged}
                  onChange={(e) => setLockAcknowledged(e.target.checked)}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  I have reviewed all listed transactions and accept
                  responsibility for requesting these locks.
                </span>
              </label>
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
                    lockFetchPending ||
                    !selectedLockCount ||
                    !lockAcknowledged ||
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
      <Modal
        open={Boolean(pendingExclusion)}
        onClose={cancelPendingExclusion}
        title="Exclude transaction"
        width="500px"
      >
        {pendingExclusion ? (
          <div>
            <p>
              Provide a justification for excluding{' '}
              <strong>
                {pendingExclusion.candidate?.tableName ||
                  pendingExclusion.candidate?.table ||
                  'record'}
                #{
                  pendingExclusion.candidate?.recordId ??
                  pendingExclusion.candidate?.id ??
                  '—'
                }
              </strong>{' '}
              from the approval request.
            </p>
            {(pendingExclusion.candidate?.label ||
              pendingExclusion.candidate?.description) && (
              <p style={{ marginTop: '0.25rem' }}>
                {pendingExclusion.candidate?.label && (
                  <span>
                    <strong>Label:</strong>{' '}
                    {pendingExclusion.candidate.label}
                    <br />
                  </span>
                )}
                {pendingExclusion.candidate?.description && (
                  <span>
                    <strong>Description:</strong>{' '}
                    {pendingExclusion.candidate.description}
                  </span>
                )}
              </p>
            )}
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              <span style={{ fontWeight: 'bold' }}>Exclusion reason</span>
              <textarea
                value={pendingExclusion.reason}
                onChange={(e) => updatePendingExclusionReason(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '5rem',
                  marginTop: '0.25rem',
                }}
                placeholder="Explain why this transaction should remain unlocked"
              />
            </label>
            {pendingExclusion.error && (
              <p style={{ color: 'red', marginTop: '0.25rem' }}>
                {pendingExclusion.error}
              </p>
            )}
            <div style={{ marginTop: '0.75rem' }}>
              <button onClick={confirmPendingExclusion}>Save exclusion</button>
              <button
                type="button"
                onClick={cancelPendingExclusion}
                style={{ marginLeft: '0.5rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
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
                            {renderReportMetadata(meta, {
                              requestId: req.request_id,
                            })}
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
                              {renderReportMetadata(meta, {
                                requestId: req.request_id,
                              })}
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

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
import AutoSizingTextInput from '../components/AutoSizingTextInput.jsx';
import {
  normalizeSnapshotRecord,
  resolveSnapshotSource,
} from '../utils/normalizeSnapshot.js';

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

function normalizeNumericId(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function extractNumericTokens(value) {
  if (typeof value !== 'string') return [];
  const matches = value.match(/\d+/g);
  if (!matches) return [];
  return matches
    .map((token) => {
      const parsed = Number.parseInt(token, 10);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((num) => num !== null);
}

function normalizeWorkplaceAssignment(assignment) {
  if (!assignment || typeof assignment !== 'object') return null;
  const workplaceId = normalizeNumericId(
    assignment.workplace_id ?? assignment.workplaceId,
  );
  const workplaceSessionId = normalizeNumericId(
    assignment.workplace_session_id ??
      assignment.workplaceSessionId ??
      assignment.workplace_id ??
      assignment.workplaceId,
  );

  const finalSessionId =
    workplaceSessionId ?? workplaceId ?? normalizeNumericId(assignment.value);
  const finalWorkplaceId = workplaceId ?? finalSessionId ?? null;

  return {
    ...assignment,
    workplace_id: finalWorkplaceId,
    workplace_session_id: finalSessionId,
  };
}

function summarizeForToast(payload) {
  try {
    const json = JSON.stringify(payload);
    if (!json) return '{}';
    if (json.length <= 140) return json;
    return `${json.slice(0, 137)}…`;
  } catch {
    return '[unserializable]';
  }
}

function stringifyDiagnosticValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) {
    const flattened = value
      .map((item) => stringifyDiagnosticValue(item))
      .filter((item) => typeof item === 'string' && item.length > 0);
    return flattened.length ? flattened.join('\n') : null;
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string' && value.text.length) {
      return value.text;
    }
    if (Array.isArray(value.lines)) {
      const lines = value.lines
        .map((line) => stringifyDiagnosticValue(line))
        .filter((line) => typeof line === 'string' && line.length > 0);
      if (lines.length) return lines.join('\n');
    }
    try {
      const json = JSON.stringify(value);
      return json && json.length ? json : null;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const REPORT_REQUEST_TABLE = 'report_transaction_locks';
const ALL_WORKPLACE_OPTION = '__ALL_WORKPLACE_SESSIONS__';

export default function Reports() {
  const { company, branch, department, position, workplace, user, session } =
    useContext(AuthContext);
  const buttonPerms = useButtonPerms();
  const { addToast } = useToast();
  const generalConfig = useGeneralConfig();
  const [procedures, setProcedures] = useState([]);
  const [selectedProc, setSelectedProc] = useState('');
  const [procParams, setProcParams] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [workplaceSelection, setWorkplaceSelection] = useState(
    ALL_WORKPLACE_OPTION,
  );
  const [result, setResult] = useState(null);
  const [manualParams, setManualParams] = useState({});
  const [snapshot, setSnapshot] = useState(null);
  const [lockCandidates, setLockCandidates] = useState([]);
  const [lockSelections, setLockSelections] = useState({});
  const [lockExclusions, setLockExclusions] = useState({});
  const [pendingExclusion, setPendingExclusion] = useState(null);
  const [lockFetchPending, setLockFetchPending] = useState(false);
  const [lockFetchError, setLockFetchError] = useState('');
  const [populateLockCandidates, setPopulateLockCandidates] = useState(true);
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
  const [workplaceAssignmentsForPeriod, setWorkplaceAssignmentsForPeriod] =
    useState(null);
  const workplaceFetchDiagnosticsEnabled =
    generalConfig?.general?.workplaceFetchToastEnabled !== false;
  const usingBaseAssignments = !Array.isArray(workplaceAssignmentsForPeriod);
  const expandedTransactionDetailsRef = useRef(expandedTransactionDetails);
  const [requestLockDetailsState, setRequestLockDetailsState] = useState({});
  const requestLockDetailsRef = useRef(requestLockDetailsState);
  const presetSelectRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const workplaceSelectRef = useRef(null);
  const workplaceSelectionTouchedRef = useRef(false);
  const manualInputRefs = useRef({});
  const runButtonRef = useRef(null);
  const baseWorkplaceAssignments = useMemo(
    () =>
      Array.isArray(session?.workplace_assignments)
        ? session.workplace_assignments
        : [],
    [session],
  );
  const workplaceAssignments = useMemo(() => {
    if (Array.isArray(workplaceAssignmentsForPeriod)) {
      return workplaceAssignmentsForPeriod;
    }
    return baseWorkplaceAssignments;
  }, [workplaceAssignmentsForPeriod, baseWorkplaceAssignments]);

  const workplaceSelectOptions = useMemo(() => {
    const assignments = Array.isArray(workplaceAssignments)
      ? workplaceAssignments
      : [];
    const normalizedAssignments = assignments.reduce((list, assignment) => {
      const normalized = normalizeWorkplaceAssignment(assignment);
      if (normalized) list.push(normalized);
      return list;
    }, []);

    const options = [];
    const seenComposite = new Set();
    const seenWorkplaceIds = new Set();
    const seenSessionIds = new Set();

    normalizedAssignments.forEach((assignment) => {
      const normalizedWorkplaceId = assignment.workplace_id;
      const normalizedSessionId = assignment.workplace_session_id;
      const valueSource =
        normalizedSessionId != null
          ? normalizedSessionId
          : normalizedWorkplaceId != null
          ? normalizedWorkplaceId
          : null;
      if (valueSource == null) return;

      const hasWorkplaceId = normalizedWorkplaceId != null;
      const hasSessionId = normalizedSessionId != null;
      const compositeKey =
        hasWorkplaceId && hasSessionId
          ? `${normalizedWorkplaceId}|${normalizedSessionId}`
          : null;
      if (compositeKey && seenComposite.has(compositeKey)) return;
      if (!hasSessionId && hasWorkplaceId && seenWorkplaceIds.has(normalizedWorkplaceId)) {
        return;
      }
      if (!hasWorkplaceId && hasSessionId && seenSessionIds.has(normalizedSessionId)) {
        return;
      }

      const value = String(valueSource);
      const idParts = [];
      if (normalizedWorkplaceId != null) {
        idParts.push(`#${normalizedWorkplaceId}`);
      }
      if (
        normalizedSessionId != null &&
        normalizedSessionId !== normalizedWorkplaceId
      ) {
        idParts.push(`session ${normalizedSessionId}`);
      }
      const idLabel = idParts.join(' · ');
      const baseName = assignment.workplace_name
        ? String(assignment.workplace_name).trim()
        : '';
      const contextParts = [];
      if (assignment.department_name) {
        contextParts.push(String(assignment.department_name).trim());
      }
      if (assignment.branch_name) {
        contextParts.push(String(assignment.branch_name).trim());
      }
      const context = contextParts.filter(Boolean).join(' / ');
      const labelParts = [idLabel, baseName, context].filter(
        (part) => part && part.length,
      );

      options.push({
        value,
        label: labelParts.length ? labelParts.join(' – ') : `Session ${value}`,
        workplaceId: normalizedWorkplaceId,
        workplaceSessionId: normalizedSessionId ?? normalizedWorkplaceId,
      });

      if (compositeKey) {
        seenComposite.add(compositeKey);
      }
      if (hasWorkplaceId) {
        seenWorkplaceIds.add(normalizedWorkplaceId);
      }
      if (hasSessionId) {
        seenSessionIds.add(normalizedSessionId);
      }
    });

    const fallbackWorkplaceId = normalizeNumericId(
      session?.workplace_id ?? normalizeNumericId(workplace),
    );
    const fallbackSessionId = normalizeNumericId(
      session?.workplace_session_id ?? session?.workplace_id ?? normalizeNumericId(workplace),
    );

    if (usingBaseAssignments) {
      const valueSource =
        fallbackSessionId != null
          ? fallbackSessionId
          : fallbackWorkplaceId != null
          ? fallbackWorkplaceId
          : null;
      if (valueSource != null) {
        const hasFallbackWorkplace = fallbackWorkplaceId != null;
        const hasFallbackSession = fallbackSessionId != null;
        const compositeKey =
          hasFallbackWorkplace && hasFallbackSession
            ? `${fallbackWorkplaceId}|${fallbackSessionId}`
            : null;
        const duplicateByComposite = compositeKey
          ? seenComposite.has(compositeKey)
          : false;
        const duplicateByWorkplace =
          !hasFallbackSession &&
          hasFallbackWorkplace &&
          seenWorkplaceIds.has(fallbackWorkplaceId);
        const duplicateBySession =
          !hasFallbackWorkplace &&
          hasFallbackSession &&
          seenSessionIds.has(fallbackSessionId);
        if (!duplicateByComposite && !duplicateByWorkplace && !duplicateBySession) {
          const value = String(valueSource);
          const idParts = [];
          if (fallbackWorkplaceId != null) {
            idParts.push(`#${fallbackWorkplaceId}`);
          }
          if (
            fallbackSessionId != null &&
            fallbackSessionId !== fallbackWorkplaceId
          ) {
            idParts.push(`session ${fallbackSessionId}`);
          }
          const idLabel = idParts.join(' · ');
          const baseName = session?.workplace_name
            ? String(session.workplace_name).trim()
            : '';
          const contextParts = [];
          if (session?.department_name) {
            contextParts.push(String(session.department_name).trim());
          }
          if (session?.branch_name) {
            contextParts.push(String(session.branch_name).trim());
          }
          const context = contextParts.filter(Boolean).join(' / ');
          const labelParts = [idLabel, baseName, context].filter(
            (part) => part && part.length,
          );
          options.push({
            value,
            label: labelParts.length ? labelParts.join(' – ') : `Session ${value}`,
            workplaceId: fallbackWorkplaceId ?? fallbackSessionId ?? null,
            workplaceSessionId: fallbackSessionId ?? fallbackWorkplaceId ?? null,
          });

          if (compositeKey) {
            seenComposite.add(compositeKey);
          }
          if (hasFallbackWorkplace) {
            seenWorkplaceIds.add(fallbackWorkplaceId);
          }
          if (hasFallbackSession) {
            seenSessionIds.add(fallbackSessionId);
          }
        }
      }
    }

    options.sort((a, b) => a.label.localeCompare(b.label));

    if (options.length > 1) {
      return [
        {
          value: ALL_WORKPLACE_OPTION,
          label: 'All workplaces',
          workplaceId: null,
          workplaceSessionId: null,
        },
        ...options,
      ];
    }

    return options;
  }, [session, workplace, workplaceAssignments, usingBaseAssignments]);

  const normalizedProcParams = useMemo(() => {
    return procParams.map((param) => ({
      original: param,
      normalized: typeof param === 'string' ? normalizeParamName(param) : '',
    }));
  }, [procParams]);

  const hasWorkplaceParam = useMemo(
    () =>
      normalizedProcParams.some(({ normalized }) => {
        if (!normalized) return false;
        return normalized.includes('workplace') || normalized.includes('workloc');
      }),
    [normalizedProcParams],
  );

  const yearParamNames = useMemo(
    () =>
      normalizedProcParams
        .filter(({ normalized }) => normalized && normalized.includes('year'))
        .map(({ original }) => original),
    [normalizedProcParams],
  );

  const monthParamNames = useMemo(
    () =>
      normalizedProcParams
        .filter(({ normalized }) => normalized && normalized.includes('month'))
        .map(({ original }) => original),
    [normalizedProcParams],
  );

  const requiresYearMonthParams = useMemo(
    () => yearParamNames.length > 0 && monthParamNames.length > 0,
    [yearParamNames, monthParamNames],
  );

  const yearMonthValuesProvided = useMemo(() => {
    if (!requiresYearMonthParams) return true;
    const hasValue = (name) => {
      const rawValue = manualParams[name];
      if (rawValue === null || rawValue === undefined) return false;
      if (typeof rawValue === 'string') return rawValue.trim().length > 0;
      return true;
    };
    return (
      yearParamNames.every(hasValue) && monthParamNames.every(hasValue)
    );
  }, [requiresYearMonthParams, manualParams, yearParamNames, monthParamNames]);

  const selectedYearMonth = useMemo(() => {
    if (!hasWorkplaceParam || !yearMonthValuesProvided) return null;
    const resolveValue = (names) => {
      for (const name of names) {
        const raw = manualParams[name];
        if (raw === undefined || raw === null) continue;
        const str = String(raw).trim();
        if (str) return str;
      }
      return null;
    };
    const rawYear = resolveValue(yearParamNames);
    const rawMonth = resolveValue(monthParamNames);
    if (!rawYear || !rawMonth) return null;

    let year = Number.parseInt(rawYear, 10);
    if (!Number.isFinite(year)) {
      const yearMatch = rawYear.match(/(\d{4})/);
      year = yearMatch ? Number.parseInt(yearMatch[1], 10) : NaN;
    }
    if (!Number.isFinite(year)) return null;

    const monthTokens = rawMonth.split(/[^0-9]/).filter(Boolean);
    const monthSource = monthTokens.length
      ? monthTokens[monthTokens.length - 1]
      : rawMonth;
    const month = Number.parseInt(monthSource, 10);
    if (!Number.isFinite(month) || month < 1 || month > 12) return null;

    return { year, month };
  }, [
    hasWorkplaceParam,
    yearMonthValuesProvided,
    manualParams,
    yearParamNames,
    monthParamNames,
  ]);

  const showWorkplaceSelector = hasWorkplaceParam;

  const workplaceDateQuery = useMemo(() => {
    if (!hasWorkplaceParam) {
      return { status: 'disabled', params: null };
    }
    if (requiresYearMonthParams) {
      if (!selectedYearMonth) {
        return { status: 'waiting', params: null };
      }
      return {
        status: 'ready',
        params: {
          year: String(selectedYearMonth.year),
          month: String(selectedYearMonth.month),
        },
      };
    }
    const normalizedStart = startDate ? String(startDate).trim() : '';
    const normalizedEnd = endDate ? String(endDate).trim() : '';
    const effective = normalizedStart || normalizedEnd;
    if (!effective) {
      return { status: 'waiting', params: null };
    }
    const params = { date: effective };
    if (normalizedStart) params.startDate = normalizedStart;
    if (normalizedEnd) params.endDate = normalizedEnd;
    return { status: 'ready', params };
  }, [
    hasWorkplaceParam,
    requiresYearMonthParams,
    selectedYearMonth,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!hasWorkplaceParam) {
      setWorkplaceAssignmentsForPeriod(null);
      return () => {
        cancelled = true;
      };
    }

    if (workplaceDateQuery.status !== 'ready' || !workplaceDateQuery.params) {
      workplaceSelectionTouchedRef.current = false;
      setWorkplaceAssignmentsForPeriod(null);
      return () => {
        cancelled = true;
      };
    }

    const params = new URLSearchParams();
    const paramsObject = {};
    Object.entries(workplaceDateQuery.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).length) {
        const valueStr = String(value);
        params.set(key, valueStr);
        paramsObject[key] = valueStr;
      }
    });
    const companyIdForQuery =
      normalizeNumericId(session?.company_id) ?? normalizeNumericId(company);
    if (companyIdForQuery != null) {
      const companyIdValue = String(companyIdForQuery);
      params.set('companyId', companyIdValue);
      paramsObject.companyId = companyIdValue;
    }

    const userIdForQuery = (() => {
      const raw =
        user?.empid ??
        session?.empid ??
        session?.employee_id ??
        session?.employeeId ??
        null;
      if (raw === undefined || raw === null) return null;
      const str = String(raw).trim();
      return str.length ? str : null;
    })();
    if (userIdForQuery !== null) {
      params.set('userId', userIdForQuery);
      paramsObject.userId = userIdForQuery;
    }

    const controller = new AbortController();
    workplaceSelectionTouchedRef.current = false;
    setWorkplaceAssignmentsForPeriod(null);

    const queryString = params.toString();
    const queryUrl = queryString
      ? `/api/reports/workplaces?${queryString}`
      : '/api/reports/workplaces';
    const paramsSummary = summarizeForToast(paramsObject);

    async function loadWorkplaceAssignments() {
      if (workplaceFetchDiagnosticsEnabled) {
        let startMessage = `Fetching workplaces with params ${paramsSummary}`;
        if (queryString) {
          startMessage += `\nQuery: ${queryUrl}`;
        }
        addToast(startMessage, 'info');
      }
      try {
        const res = await fetch(queryUrl, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error('Failed to load workplaces for selected period');
        }
        const data = await res.json().catch(() => ({}));
        const diagnostics =
          data && typeof data === 'object' ? data.diagnostics ?? null : null;
        let diagnosticSql =
          stringifyDiagnosticValue(diagnostics?.formattedSql) ?? null;
        if (
          !diagnosticSql ||
          (typeof diagnosticSql === 'string' && diagnosticSql.trim().length === 0)
        ) {
          diagnosticSql = stringifyDiagnosticValue(diagnostics?.sql) ?? null;
        }
        const diagnosticCounts = [];
        const normalizeCount = (value) =>
          typeof value === 'number' && Number.isFinite(value) ? value : null;
        const rowCount = normalizeCount(diagnostics?.rowCount);
        const filteredCount = normalizeCount(diagnostics?.filteredCount);
        const assignmentCount = normalizeCount(diagnostics?.assignmentCount);
        const normalizedAssignmentCount = normalizeCount(
          diagnostics?.normalizedAssignmentCount,
        );
        if (rowCount !== null) {
          diagnosticCounts.push(`rows: ${rowCount}`);
        }
        if (filteredCount !== null) {
          diagnosticCounts.push(`filtered: ${filteredCount}`);
        }
        if (assignmentCount !== null) {
          diagnosticCounts.push(`assignments: ${assignmentCount}`);
        }
        if (normalizedAssignmentCount !== null) {
          diagnosticCounts.push(
            `normalized: ${normalizedAssignmentCount}`,
          );
        }
        const assignments = Array.isArray(data.assignments)
          ? data.assignments
          : [];
        const normalizedAssignments = [];
        const validAssignments = [];
        assignments.forEach((assignment) => {
          const normalized = normalizeWorkplaceAssignment(assignment);
          if (!normalized) return;
          const workplaceId = normalizeNumericId(
            normalized.workplace_id ??
              normalized.workplace_session_id ??
              normalized.workplaceId ??
              normalized.workplaceSessionId,
          );
          const sessionId = normalizeNumericId(
            normalized.workplace_session_id ??
              normalized.workplace_id ??
              normalized.workplaceSessionId ??
              normalized.workplaceId,
          );
          if (workplaceId != null || sessionId != null) {
            const enriched = {
              ...normalized,
              workplace_id: workplaceId ?? sessionId ?? null,
              workplace_session_id: sessionId ?? workplaceId ?? null,
            };
            normalizedAssignments.push(enriched);
            if (
              normalizeNumericId(enriched.workplace_id) !== null &&
              normalizeNumericId(enriched.workplace_session_id) !== null
            ) {
              validAssignments.push(enriched);
            }
          }
        });
        const validCount = validAssignments.length;
        if (!cancelled) {
          workplaceSelectionTouchedRef.current = false;
          if (validCount > 0) {
            setWorkplaceAssignmentsForPeriod(validAssignments);
          } else if (normalizedAssignments.length > 0) {
            setWorkplaceAssignmentsForPeriod(normalizedAssignments);
          } else {
            setWorkplaceAssignmentsForPeriod(null);
          }
          if (workplaceFetchDiagnosticsEnabled) {
            let sampleText = '';
            if (validCount > 0) {
              const hasSample = validAssignments.some((assignment) => {
                const workplaceId = normalizeNumericId(
                  assignment.workplace_id ?? assignment.workplaceId,
                );
                const sessionId = normalizeNumericId(
                  assignment.workplace_session_id ??
                    assignment.workplaceSessionId ??
                    assignment.workplace_id ??
                    assignment.workplaceId,
                );
                if (workplaceId === null || sessionId === null) return false;
                sampleText = ` (first #${workplaceId}${
                  sessionId !== workplaceId ? ` session ${sessionId}` : ''
                })`;
                return true;
              });
              if (!hasSample) sampleText = '';
            }
            const baseMessage = `Workplace fetch params ${paramsSummary} → ${validCount}/${assignments.length} valid assignments`;
            const suffix =
              validCount > 0
                ? sampleText
                : normalizedAssignments.length > 0
                ? ' (no valid IDs returned; showing raw results)'
                : ' (using base assignments)';
            let toastMessage = `${baseMessage}${suffix}`;
            const details = [];
            if (queryString) {
              details.push(`Query: ${queryUrl}`);
            }
            if (
              typeof diagnosticSql === 'string' &&
              diagnosticSql.trim().length > 0
            ) {
              details.push(`SQL: ${diagnosticSql}`);
            }
            if (diagnosticCounts.length) {
              details.push(`Counts: ${diagnosticCounts.join(', ')}`);
            }
            if (diagnostics?.effectiveDate) {
              details.push(`Effective date: ${diagnostics.effectiveDate}`);
            }
            if (
              diagnostics?.selectedWorkplaceId != null ||
              diagnostics?.selectedWorkplaceSessionId != null
            ) {
              const selectedParts = [];
              if (diagnostics?.selectedWorkplaceId != null) {
                selectedParts.push(`workplace #${diagnostics.selectedWorkplaceId}`);
              }
              if (diagnostics?.selectedWorkplaceSessionId != null) {
                selectedParts.push(
                  `session ${diagnostics.selectedWorkplaceSessionId}`,
                );
              }
              if (selectedParts.length) {
                details.push(`Selected: ${selectedParts.join(', ')}`);
              }
            }
            const consumedDiagnosticKeys = new Set([
              'sql',
              'formattedSql',
              'params',
              'rowCount',
              'filteredCount',
              'assignmentCount',
              'normalizedAssignmentCount',
              'effectiveDate',
              'selectedWorkplaceId',
              'selectedWorkplaceSessionId',
            ]);
            if (
              Array.isArray(diagnostics?.params) &&
              diagnostics.params.length
            ) {
              consumedDiagnosticKeys.add('params');
              const paramsString = stringifyDiagnosticValue(diagnostics.params);
              if (paramsString) {
                details.push(`Params: ${paramsString}`);
              }
            }
            if (diagnostics && typeof diagnostics === 'object') {
              Object.entries(diagnostics).forEach(([key, value]) => {
                if (consumedDiagnosticKeys.has(key)) return;
                if (value === undefined || value === null) return;
                const valueString = stringifyDiagnosticValue(value);
                if (!valueString) return;
                details.push(`${key}: ${valueString}`);
              });
            }
            if (details.length) {
              toastMessage += `\n${details.join('\n')}`;
            }
            addToast(toastMessage, validCount > 0 ? 'success' : 'info');
          }
        }
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;
        workplaceSelectionTouchedRef.current = false;
        setWorkplaceAssignmentsForPeriod(null);
        if (workplaceFetchDiagnosticsEnabled) {
          const detailedMessage = err?.message || 'Unknown error';
          let errorMessage = `Workplace fetch params ${paramsSummary} failed: ${detailedMessage}`;
          if (queryString) {
            errorMessage += `\nQuery: ${queryUrl}`;
          }
          addToast(errorMessage, 'error');
        }
        addToast(
          'Failed to load workplaces for the selected period',
          'error',
        );
      }
    }

    loadWorkplaceAssignments();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    hasWorkplaceParam,
    workplaceDateQuery,
    session?.company_id,
    session?.empid,
    session?.employee_id,
    session?.employeeId,
    user?.empid,
    company,
    addToast,
    workplaceFetchDiagnosticsEnabled,
  ]);

  useEffect(() => {
    if (!showWorkplaceSelector || !workplaceSelectOptions.length) {
      if (workplaceSelection !== ALL_WORKPLACE_OPTION) {
        workplaceSelectionTouchedRef.current = false;
        setWorkplaceSelection(ALL_WORKPLACE_OPTION);
      }
      return;
    }

    const values = new Set(workplaceSelectOptions.map((option) => option.value));
    const normalizedSessionId = normalizeNumericId(
      session?.workplace_session_id ??
        session?.workplace_id ??
        workplace,
    );
    const preferredOption =
      normalizedSessionId != null
        ? workplaceSelectOptions.find((option) => {
            if (option.workplaceSessionId != null) {
              return option.workplaceSessionId === normalizedSessionId;
            }
            const numericValue = normalizeNumericId(option.value);
            return numericValue === normalizedSessionId;
          }) || null
        : null;
    const fallbackOption =
      workplaceSelectOptions.find(
        (option) => option.value !== ALL_WORKPLACE_OPTION,
      ) || workplaceSelectOptions[0] || null;

    if (!workplaceSelectionTouchedRef.current && preferredOption) {
      if (workplaceSelection !== preferredOption.value) {
        setWorkplaceSelection(preferredOption.value);
      }
      return;
    }

    if (!values.has(workplaceSelection)) {
      const nextOption = preferredOption ?? fallbackOption;
      if (nextOption && workplaceSelection !== nextOption.value) {
        setWorkplaceSelection(nextOption.value);
      }
    }
  }, [
    showWorkplaceSelector,
    workplaceSelectOptions,
    workplaceSelection,
    session?.workplace_session_id,
    session?.workplace_id,
    workplace,
  ]);

  const selectedWorkplaceOption = useMemo(() => {
    if (!showWorkplaceSelector || !workplaceSelectOptions.length) return null;
    return (
      workplaceSelectOptions.find((option) => option.value === workplaceSelection) ||
      workplaceSelectOptions[0] ||
      null
    );
  }, [showWorkplaceSelector, workplaceSelectOptions, workplaceSelection]);

  const selectedWorkplaceIds = useMemo(() => {
    if (!showWorkplaceSelector || !selectedWorkplaceOption) {
      return { workplaceId: null, workplaceSessionId: null };
    }
    if (selectedWorkplaceOption.value === ALL_WORKPLACE_OPTION) {
      return { workplaceId: null, workplaceSessionId: null };
    }
    const workplaceSessionId = normalizeNumericId(
      selectedWorkplaceOption.workplaceSessionId ??
        selectedWorkplaceOption.workplaceId ??
        selectedWorkplaceOption.value,
    );
    const workplaceId = normalizeNumericId(
      selectedWorkplaceOption.workplaceId ??
        selectedWorkplaceOption.workplaceSessionId ??
        selectedWorkplaceOption.value,
    );
    return {
      workplaceId: workplaceId ?? null,
      workplaceSessionId: workplaceSessionId ?? workplaceId ?? null,
    };
  }, [showWorkplaceSelector, selectedWorkplaceOption]);

  const { workplaceId: selectedWorkplaceId, workplaceSessionId: selectedWorkplaceSessionId } =
    selectedWorkplaceIds;

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

  const getCandidateTable = useCallback((candidate) => {
    if (!candidate || typeof candidate !== 'object') return '';
    const tableSources = [
      candidate.tableName,
      candidate.table,
      candidate.table_name,
      candidate.lockTable,
      candidate.lock_table,
      candidate.lockTableName,
      candidate.lock_table_name,
    ];
    for (const source of tableSources) {
      if (source === undefined || source === null) continue;
      const str = String(source).trim();
      if (str) return str;
    }
    return '';
  }, []);

  const getCandidateKey = useCallback(
    (candidate) => {
      if (!candidate || typeof candidate !== 'object') return '';
      if (candidate.key) return String(candidate.key);
      const table = getCandidateTable(candidate);
      if (!table) return '';
      const recordId =
        candidate.recordId ??
        candidate.record_id ??
        candidate.id ??
        candidate.recordID;
      if (recordId === undefined || recordId === null) return `${table}#`;
      return `${table}#${recordId}`;
    },
    [getCandidateTable],
  );

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

  function formatProcedureLabel(name) {
    const label = getLabel(name);
    if (label && name && label !== name) {
      return `${label} (${name})`;
    }
    return label || name || 'procedure';
  }

  async function extractErrorMessage(response) {
    if (!response) return '';
    try {
      const body = await response.text();
      if (!body) {
        return response.statusText || '';
      }
      try {
        const parsed = JSON.parse(body);
        if (parsed) {
          if (typeof parsed.message === 'string' && parsed.message.trim()) {
            return parsed.message.trim();
          }
          if (typeof parsed.error === 'string' && parsed.error.trim()) {
            return parsed.error.trim();
          }
        }
      } catch (parseError) {
        // Ignore JSON parse errors and fall back to plain text below.
      }
      return body.trim();
    } catch (err) {
      return response.statusText || '';
    }
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
    setPopulateLockCandidates(false);
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
    if (!result || !result.name || !populateLockCandidates) {
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
      setLockCandidates([]);
      setLockSelections({});
      setLockExclusions({});
      setPendingExclusion(null);
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
            const tableName = getCandidateTable(candidate);
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
            const rawSnapshot =
              resolveSnapshotSource(candidate) ||
              (candidate.snapshot &&
              typeof candidate.snapshot === 'object' &&
              !Array.isArray(candidate.snapshot)
                ? candidate.snapshot
                : null);
            const {
              row: normalizedSnapshot,
              columns: derivedColumns,
              fieldTypeMap,
            } = normalizeSnapshotRecord(rawSnapshot || {});
            let snapshotColumns = Array.isArray(candidate.snapshotColumns)
              ? candidate.snapshotColumns
              : Array.isArray(candidate.snapshot_columns)
              ? candidate.snapshot_columns
              : Array.isArray(candidate.columns)
              ? candidate.columns
              : [];
            snapshotColumns = snapshotColumns
              .map((col) => (col === null || col === undefined ? '' : String(col)))
              .filter(Boolean);
            if (!snapshotColumns.length) {
              snapshotColumns = derivedColumns;
            }
            const snapshotFieldTypeMap =
              candidate.snapshotFieldTypeMap ||
              candidate.snapshot_field_type_map ||
              candidate.fieldTypeMap ||
              candidate.field_type_map ||
              fieldTypeMap ||
              {};
            const next = {
              ...candidate,
              tableName,
              recordId,
              key,
              snapshot: normalizedSnapshot,
              snapshotColumns,
              snapshotFieldTypeMap,
            };
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
    getCandidateTable,
    populateLockCandidates,
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

  const sessionDefaults = useMemo(() => {
    const branchId = session?.branch_id ?? normalizeNumericId(branch);
    const companyId = session?.company_id ?? normalizeNumericId(company);
    const departmentId = session?.department_id ?? normalizeNumericId(department);
    const positionId =
      session?.position_id ?? normalizeNumericId(position);
    const normalizedContextWorkplace = normalizeNumericId(workplace);
    const baseWorkplaceId = normalizeNumericId(
      session?.workplace_id ?? session?.workplaceId ?? normalizedContextWorkplace,
    );
    const baseWorkplaceSessionId = normalizeNumericId(
      session?.workplace_session_id ??
        session?.workplaceSessionId ??
        session?.workplace_id ??
        session?.workplaceId ??
        normalizedContextWorkplace,
    );
    const userEmpId =
      user?.empid ?? session?.empid ?? session?.employee_id ?? null;
    const userId = user?.id ?? session?.user_id ?? null;
    const seniorEmpId = session?.senior_empid ?? null;
    const seniorPlanEmpId = session?.senior_plan_empid ?? null;
    const userLevel = session?.user_level ?? null;

    const effectiveWorkplaceId =
      selectedWorkplaceId ??
      baseWorkplaceId ??
      selectedWorkplaceSessionId ??
      baseWorkplaceSessionId ??
      null;
    const effectiveWorkplaceSessionId =
      selectedWorkplaceSessionId ??
      baseWorkplaceSessionId ??
      selectedWorkplaceId ??
      baseWorkplaceId ??
      null;

    return {
      branchId: branchId ?? null,
      companyId: companyId ?? null,
      departmentId: departmentId ?? null,
      positionId: positionId ?? null,
      workplaceId: effectiveWorkplaceId ?? null,
      workplaceSessionId: effectiveWorkplaceSessionId ?? null,
      userEmpId: userEmpId ?? null,
      userId: userId ?? null,
      seniorEmpId,
      seniorPlanEmpId,
      userLevel,
    };
  }, [
    branch,
    company,
    department,
    position,
    session,
    user,
    workplace,
    selectedWorkplaceId,
    selectedWorkplaceSessionId,
  ]);

  const autoParams = useMemo(() => {
    return procParams.map((p, index) => {
      if (startIndices.has(index)) return startDate || null;
      if (endIndices.has(index)) return endDate || null;
      const name =
        typeof p === 'string' ? normalizeParamName(p) : '';
      if (!name) return null;
      if (
        name.includes('sessionworkplace') ||
        name.includes('workplacesession')
      ) {
        return (
          sessionDefaults.workplaceId ?? sessionDefaults.workplaceSessionId
        );
      }
      if (name.includes('company')) return sessionDefaults.companyId;
      if (name.includes('branch')) return sessionDefaults.branchId;
      if (name.includes('department') || name.includes('dept'))
        return sessionDefaults.departmentId;
      if (name.includes('position')) return sessionDefaults.positionId;
      if (name.includes('workplace') || name.includes('workloc'))
        return sessionDefaults.workplaceId;
      if (name.includes('seniorplan') || name.includes('plansenior'))
        return sessionDefaults.seniorPlanEmpId;
      if (name.includes('senior')) return sessionDefaults.seniorEmpId;
      if (name.includes('userlevel')) return sessionDefaults.userLevel;
      if (name.includes('userid'))
        return sessionDefaults.userId ?? sessionDefaults.userEmpId;
      if (name.includes('user') || name.includes('emp'))
        return sessionDefaults.userEmpId;
      return null;
    });
  }, [
    procParams,
    startIndices,
    endIndices,
    startDate,
    endDate,
    sessionDefaults,
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
    if (showWorkplaceSelector) refs.push(workplaceSelectRef);

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
  }, [
    hasDateParams,
    hasStartParam,
    hasEndParam,
    manualParamNames,
    showWorkplaceSelector,
  ]);

  useEffect(() => {
    if (!selectedProc) return;
    const firstFocusable = activeControlRefs.find((ref) => ref?.current);
    if (firstFocusable) {
      firstFocusable.current.focus();
    }
  }, [selectedProc, activeControlRefs]);

  const handleManualParamChange = useCallback(
    (name, value) => {
      setManualParams((prev) => ({ ...prev, [name]: value }));
    },
    [],
  );

  const finalParams = useMemo(() => {
    return procParams.map((p, i) => {
      const auto = autoParams[i];
      const rawValue = auto ?? manualParams[p] ?? null;
      if (rawValue === null || rawValue === undefined) {
        return rawValue;
      }
      if (typeof p !== 'string') {
        return rawValue;
      }
      const normalizedName = normalizeParamName(p);
      if (!normalizedName) {
        return rawValue;
      }
      if (
        (normalizedName.includes('workplace') || normalizedName.includes('workloc')) &&
        !normalizedName.includes('name')
      ) {
        const numericValue = normalizeNumericId(rawValue);
        if (numericValue !== null) {
          return numericValue;
        }
        const tokenCandidates = extractNumericTokens(String(rawValue));
        if (tokenCandidates.length > 0) {
          const normalizedPreferences = [
            selectedWorkplaceId,
            sessionDefaults.workplaceId,
            selectedWorkplaceSessionId,
            sessionDefaults.workplaceSessionId,
          ]
            .map((value) => normalizeNumericId(value))
            .filter((value) => value !== null);
          const preferredToken = normalizedPreferences.find((preferred) =>
            tokenCandidates.includes(preferred),
          );
          const candidate = preferredToken ?? tokenCandidates[0];
          if (Number.isFinite(candidate)) {
            return candidate;
          }
        }
        if (normalizedName.includes('session')) {
          const fallbackWorkplaceId = normalizeNumericId(
            selectedWorkplaceId ??
              sessionDefaults.workplaceId ??
              selectedWorkplaceSessionId ??
              sessionDefaults.workplaceSessionId,
          );
          if (fallbackWorkplaceId !== null) {
            return fallbackWorkplaceId;
          }
          const fallbackSessionId = normalizeNumericId(
            selectedWorkplaceSessionId ??
              sessionDefaults.workplaceSessionId ??
              selectedWorkplaceId ??
              sessionDefaults.workplaceId,
          );
          if (fallbackSessionId !== null) {
            return fallbackSessionId;
          }
        } else {
          const fallbackWorkplaceId = normalizeNumericId(
            selectedWorkplaceId ??
              sessionDefaults.workplaceId ??
              selectedWorkplaceSessionId ??
              sessionDefaults.workplaceSessionId,
          );
          if (fallbackWorkplaceId !== null) {
            return fallbackWorkplaceId;
          }
        }
        return null;
      }
      return rawValue;
    });
  }, [
    procParams,
    autoParams,
    manualParams,
    selectedWorkplaceId,
    selectedWorkplaceSessionId,
    sessionDefaults,
  ]);

  const allParamsProvided = useMemo(
    () => finalParams.every((v) => v !== null && v !== ''),
    [finalParams],
  );

  function handleParameterKeyDown(event, currentRef, paramName) {
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
    const errorLabel = formatProcedureLabel(selectedProc);
    const paramSummary = summarizeForToast(paramMap);
    addToast(`Calling ${label} with params ${paramSummary}`, 'info');
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
          `${label} params ${paramSummary} → ${rows.length} row${
            rows.length === 1 ? '' : 's'
          }`,
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
        const detailedMessage =
          (await extractErrorMessage(res)) || 'Failed to run procedure';
        addToast(
          `Failed to run ${errorLabel} with params ${paramSummary}: ${detailedMessage}`,
          'error',
        );
      }
    } catch (err) {
      const fallbackMessage =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to run procedure';
      addToast(
        `Failed to run ${errorLabel} with params ${paramSummary}: ${fallbackMessage}`,
        'error',
      );
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
      const tableName = candidate?.tableName || getCandidateTable(candidate);
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
  }, [lockCandidates, getCandidateTable]);

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
            const rawSnapshot =
              resolveSnapshotSource(lock) ||
              (lock.snapshot &&
              typeof lock.snapshot === 'object' &&
              !Array.isArray(lock.snapshot)
                ? lock.snapshot
                : null);
            const {
              row: normalizedSnapshot,
              columns: derivedColumns,
              fieldTypeMap,
            } = normalizeSnapshotRecord(rawSnapshot || {});
            let snapshotColumns = Array.isArray(lock.snapshotColumns)
              ? lock.snapshotColumns
              : Array.isArray(lock.snapshot_columns)
              ? lock.snapshot_columns
              : Array.isArray(lock.columns)
              ? lock.columns
              : [];
            snapshotColumns = snapshotColumns
              .map((col) => (col === null || col === undefined ? '' : String(col)))
              .filter(Boolean);
            if (!snapshotColumns.length) {
              snapshotColumns = derivedColumns;
            }
            const snapshotFieldTypeMap =
              lock.snapshotFieldTypeMap ||
              lock.snapshot_field_type_map ||
              lock.fieldTypeMap ||
              lock.field_type_map ||
              fieldTypeMap ||
              {};
            return {
              key,
              tableName,
              recordId,
              snapshot: normalizedSnapshot,
              snapshotColumns,
              snapshotFieldTypeMap,
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
    const collectTransactionsFromSource = (source) => {
      if (!source) return [];
      const results = [];
      const visited = new WeakSet();
      const ignoredKeys = new Set([
        'parameters',
        'snapshot',
        'snapshotColumns',
        'snapshot_columns',
        'snapshotFieldTypeMap',
        'snapshot_field_type_map',
        'fieldTypeMap',
        'field_type_map',
        'archive',
        'snapshotArchive',
        'snapshot_archive',
        'requestId',
        'request_id',
        'lockRequestId',
        'lock_request_id',
        'metadata',
        'report_metadata',
        'proposed_data',
        'excludedTransactions',
        'excluded_transactions',
        'lockCandidates',
        'lock_candidates',
        'lockBundle',
        'lock_bundle',
        'rows',
        'columns',
        'fieldTypes',
        'field_types',
        'rowCount',
        'row_count',
        'count',
        'total',
      ]);
      const visit = (value, fallbackTable) => {
        if (value === null || value === undefined) return;
        if (Array.isArray(value)) {
          value.forEach((item) => visit(item, fallbackTable));
          return;
        }
        if (typeof value !== 'object') {
          if (
            fallbackTable &&
            value !== null &&
            value !== undefined &&
            (typeof value === 'string' || typeof value === 'number')
          ) {
            results.push({ table: fallbackTable, recordId: value });
          }
          return;
        }
        if (visited.has(value)) return;
        visited.add(value);
        const tableCandidate =
          value.table ||
          value.tableName ||
          value.table_name ||
          value.lock_table ||
          value.lockTable ||
          fallbackTable ||
          '';
        const rawId =
          value.recordId ??
          value.record_id ??
          value.id ??
          value.recordID ??
          value.RecordId ??
          value.lock_record_id ??
          value.lockRecordId;
        if (
          tableCandidate &&
          rawId !== undefined &&
          rawId !== null &&
          (typeof rawId === 'string' || typeof rawId === 'number')
        ) {
          results.push({ ...value, table: tableCandidate, recordId: rawId });
          return;
        }
        const idList =
          value.recordIds ||
          value.record_ids ||
          value.recordIDs ||
          value.ids ||
          value.items ||
          value.records ||
          value.lock_record_ids ||
          value.lockRecordIds;
        if (tableCandidate && Array.isArray(idList) && idList.length) {
          idList.forEach((item) => {
            if (item && typeof item === 'object') {
              visit({ ...item, table: tableCandidate }, tableCandidate);
            } else if (item !== undefined && item !== null) {
              visit(item, tableCandidate);
            }
          });
          return;
        }
        Object.keys(value).forEach((key) => {
          if (['table', 'tableName', 'table_name'].includes(key)) return;
          if (
            [
              'recordId',
              'record_id',
              'recordIds',
              'record_ids',
              'recordIDs',
              'recordID',
              'ids',
              'items',
              'records',
            ].includes(key)
          ) {
            return;
          }
          if (ignoredKeys.has(key)) return;
          const child = value[key];
          const nextFallback =
            tableCandidate ||
            fallbackTable ||
            (Array.isArray(child) || (child && typeof child === 'object') ? key : '');
          visit(child, nextFallback);
        });
      };
      visit(source, '');
      const seen = new Set();
      const unique = [];
      results.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const tableName = item.table || item.tableName || item.table_name || '';
        const rawId =
          item.recordId ??
          item.record_id ??
          item.id ??
          item.recordID ??
          item.RecordId ??
          '';
        const key = `${tableName}#${rawId}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(item);
      });
      return unique;
    };

    const paramEntries = Object.entries(meta.parameters || {});
    const transactionSources = [
      meta.transactions,
      meta.transaction_list,
      meta.transactionList,
      meta.transaction_map,
      meta.transactionMap,
      meta.lockCandidates,
      meta.lock_candidates,
      meta.lockBundle,
      meta.lock_bundle,
      meta.lockBundle?.locks,
      meta.lock_bundle?.locks,
      meta.lockBundle?.records,
      meta.lock_bundle?.records,
      meta.lockBundle?.items,
      meta.lock_bundle?.items,
    ];
    const transactions = transactionSources.reduce((list, source) => {
      collectTransactionsFromSource(source).forEach((item) => list.push(item));
      return list;
    }, []);
    const excludedTransactionSources = [
      meta.excludedTransactions,
      meta.excluded_transactions,
      meta.excludedTransactionList,
      meta.excluded_transaction_list,
      meta.excludedLockBundle,
      meta.excluded_lock_bundle,
    ];
    const excludedTransactions = excludedTransactionSources.reduce(
      (list, source) => {
        collectTransactionsFromSource(source).forEach((item) => list.push(item));
        return list;
      },
      [],
    );
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
    const archiveMeta =
      meta.archive || meta.snapshotArchive || meta.snapshot_archive || null;
    const archiveRequestId =
      archiveMeta?.requestId ?? archiveMeta?.request_id ?? requestId;
    const archiveUrl = archiveRequestId
      ? `/api/report_approvals/${encodeURIComponent(archiveRequestId)}/file`
      : null;

    const formatArchiveSize = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return '';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = num;
      let unitIndex = 0;
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
      }
      const decimals = size >= 100 || unitIndex === 0 ? 0 : 1;
      return `${size.toFixed(decimals)} ${units[unitIndex]}`;
    };

    function normalizeTransaction(tx) {
      if (!tx || typeof tx !== 'object') return null;
      const tableName =
        tx.table ||
        tx.tableName ||
        tx.table_name ||
        tx.lock_table ||
        tx.lockTable ||
        '—';
      const rawId =
        tx.recordId ??
        tx.record_id ??
        tx.id ??
        tx.recordID ??
        tx.RecordId ??
        tx.lock_record_id ??
        tx.lockRecordId;
      if (!tableName || rawId === undefined || rawId === null) return null;
      const recordId = String(rawId);
      const key = `${tableName}#${recordId}`;
      const label = tx.label || tx.description || tx.note || '';
      const reason =
        tx.reason ||
        tx.justification ||
        tx.explanation ||
        tx.exclude_reason ||
        tx.lock_reason ||
        tx.lockReason ||
        '';
      const rawSnapshot =
        resolveSnapshotSource(tx) ||
        (tx.snapshot &&
        typeof tx.snapshot === 'object' &&
        !Array.isArray(tx.snapshot)
          ? tx.snapshot
          : null);
      const {
        row: snapshot,
        columns: derivedColumns,
        fieldTypeMap,
      } = normalizeSnapshotRecord(rawSnapshot || {});
      let snapshotColumns = Array.isArray(tx.snapshotColumns)
        ? tx.snapshotColumns
        : Array.isArray(tx.snapshot_columns)
        ? tx.snapshot_columns
        : Array.isArray(tx.columns)
        ? tx.columns
        : [];
      snapshotColumns = snapshotColumns
        .map((col) => (col === null || col === undefined ? '' : String(col)))
        .filter(Boolean);
      if (!snapshotColumns.length) {
        snapshotColumns = derivedColumns;
      }
      const snapshotFieldTypeMap =
        tx.snapshotFieldTypeMap ||
        tx.snapshot_field_type_map ||
        tx.fieldTypeMap ||
        tx.field_type_map ||
        fieldTypeMap ||
        {};
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

    const normalizeUnique = (list) => {
      const map = new Map();
      list.forEach((tx) => {
        const normalized = normalizeTransaction(tx);
        if (!normalized) return;
        map.set(normalized.key, normalized);
      });
      return Array.from(map.values());
    };

    const normalizedTransactions = normalizeUnique(transactions);
    const normalizedExcluded = normalizeUnique(excludedTransactions);
    const transactionBuckets = buildBuckets(normalizedTransactions);
    const excludedBuckets = buildBuckets(normalizedExcluded);
    const hasSelectedDetails = transactionBuckets.some((bucket) =>
      bucket.records.some((record) => record?.label),
    );
    const hasExcludedDetails = excludedBuckets.some((bucket) =>
      bucket.records.some((record) => record?.label),
    );

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

    const renderBucket = (bucket, listType, showDetailsColumn) => {
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
          <div style={{ margin: '0.25rem 0 0', overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                minWidth: showDetailsColumn ? '40rem' : '32rem',
              }}
            >
              <thead style={{ background: '#e5e7eb' }}>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.25rem',
                      border: '1px solid #d1d5db',
                      width: '4rem',
                    }}
                  >
                    Lock
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.25rem',
                      border: '1px solid #d1d5db',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Record ID
                  </th>
                  {showDetailsColumn && (
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
                      minWidth: '12rem',
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.25rem',
                      border: '1px solid #d1d5db',
                      minWidth: '12rem',
                    }}
                  >
                    Snapshot
                  </th>
                </tr>
              </thead>
              <tbody>
                {bucket.records.map((record, idx) => {
                  const detailKey = `${requestId ?? 'meta'}|${listType}|${record.key}`;
                  const isExpanded = Boolean(expandedTransactionDetails[detailKey]);
                  const hasSnapshot = Boolean(record.snapshot);
                  const hasRequestContext =
                    requestId !== null && requestId !== undefined;
                  const canToggle = hasSnapshot || hasRequestContext;
                  const statusColor =
                    listType === 'excluded' ? '#b91c1c' : '#047857';
                  const statusText = listType === 'excluded' ? 'Excluded' : 'Included';
                  const statusDetails =
                    listType === 'excluded'
                      ? record.reason
                        ? `Reason: ${record.reason}`
                        : 'Reason not provided.'
                      : record.reason || 'Submitted for locking.';
                  return (
                    <React.Fragment key={detailKey}>
                      <tr>
                        <td
                          style={{
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td
                          style={{
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {record.recordId}
                        </td>
                        {showDetailsColumn && (
                          <td
                            style={{
                              padding: '0.25rem',
                              border: '1px solid #d1d5db',
                            }}
                          >
                            {record.label || '—'}
                          </td>
                        )}
                        <td
                          style={{
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
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
                        </td>
                        <td
                          style={{
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
                          }}
                        >
                          {canToggle ? (
                            <>
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
                                {isExpanded
                                  ? 'Hide details'
                                  : hasSnapshot
                                  ? 'View snapshot'
                                  : 'View details'}
                              </button>
                              {isExpanded && (
                                <div style={{ marginTop: '0.25rem' }}>
                                  {renderExpandedContent(record)}
                                </div>
                              )}
                            </>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                renderBucket(bucket, 'selected', hasSelectedDetails),
              )}
            </div>
          ) : (
            <p style={{ margin: '0.25rem 0 0' }}>No transactions selected.</p>
          )}
        </div>
        {archiveMeta && archiveUrl && (
          <div style={{ marginTop: '0.5rem' }}>
            <a
              href={archiveUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View archived report
            </a>
            {archiveMeta.archivedAt && (
              <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
                archived {formatDateTime(archiveMeta.archivedAt)}
              </span>
            )}
            {archiveMeta.byteSize && (
              <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
                {formatArchiveSize(archiveMeta.byteSize)}
              </span>
            )}
          </div>
        )}
        <div style={{ marginTop: '0.5rem' }}>
          <strong>Excluded transactions</strong>
          {excludedBuckets.length ? (
            <div style={{ margin: '0.25rem 0 0' }}>
              {excludedBuckets.map((bucket) =>
                renderBucket(bucket, 'excluded', hasExcludedDetails),
              )}
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
    const serializeCandidateForRequest = (candidate, overrides = {}) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const tableName = candidate.tableName || getCandidateTable(candidate);
      if (!tableName) return null;
      const rawId =
        candidate.recordId ??
        candidate.record_id ??
        candidate.lock_record_id ??
        candidate.id;
      if (rawId === undefined || rawId === null || rawId === '') {
        return null;
      }
      const payload = {
        table: tableName,
        recordId: String(rawId),
      };

      const labelCandidate =
        candidate.label || candidate.description || candidate.note || '';
      const normalizedLabel = String(labelCandidate || '').trim();
      if (normalizedLabel) {
        payload.label = normalizedLabel;
      }

      const reasonCandidate =
        candidate.reason ||
        candidate.justification ||
        candidate.explanation ||
        candidate.exclude_reason ||
        candidate.lock_reason ||
        candidate.lockReason ||
        '';
      const normalizedReason = String(reasonCandidate || '').trim();
      if (normalizedReason) {
        payload.reason = normalizedReason;
      }

      const lockStatusCandidate =
        candidate.lockStatus || candidate.status || candidate.lock_status || '';
      const normalizedStatus = String(lockStatusCandidate || '').trim();
      if (normalizedStatus) {
        payload.lockStatus = normalizedStatus;
      }

      const lockedByCandidate =
        candidate.lockedBy || candidate.locked_by || candidate.locked_by_emp;
      const normalizedLockedBy = String(lockedByCandidate || '').trim();
      if (normalizedLockedBy) {
        payload.lockedBy = normalizedLockedBy;
      }

      const lockedAtCandidate =
        candidate.lockedAt || candidate.locked_at || candidate.locked_date;
      const normalizedLockedAt = String(lockedAtCandidate || '').trim();
      if (normalizedLockedAt) {
        payload.lockedAt = normalizedLockedAt;
      }

      if (candidate.locked || candidate.is_locked || candidate.isLocked) {
        payload.locked = true;
      }

      const rawSnapshot =
        resolveSnapshotSource(candidate) ||
        (candidate.snapshot &&
        typeof candidate.snapshot === 'object' &&
        !Array.isArray(candidate.snapshot)
          ? candidate.snapshot
          : null);
      const {
        row: normalizedSnapshot,
        columns: derivedColumns,
        fieldTypeMap,
      } = normalizeSnapshotRecord(rawSnapshot || {});
      if (normalizedSnapshot) {
        payload.snapshot = normalizedSnapshot;
        let snapshotColumns = [];
        if (Array.isArray(candidate.snapshotColumns)) {
          snapshotColumns = candidate.snapshotColumns;
        } else if (Array.isArray(candidate.snapshot_columns)) {
          snapshotColumns = candidate.snapshot_columns;
        } else if (Array.isArray(candidate.columns)) {
          snapshotColumns = candidate.columns;
        }
        snapshotColumns = snapshotColumns
          .map((col) => (col === null || col === undefined ? '' : String(col)))
          .filter(Boolean);
        if (!snapshotColumns.length && Array.isArray(derivedColumns)) {
          snapshotColumns = derivedColumns;
        }
        if (snapshotColumns.length) {
          payload.snapshotColumns = snapshotColumns;
        }
        const snapshotFieldTypeMap =
          candidate.snapshotFieldTypeMap ||
          candidate.snapshot_field_type_map ||
          candidate.fieldTypeMap ||
          candidate.field_type_map ||
          fieldTypeMap ||
          {};
        if (
          snapshotFieldTypeMap &&
          typeof snapshotFieldTypeMap === 'object' &&
          Object.keys(snapshotFieldTypeMap).length
        ) {
          payload.snapshotFieldTypeMap = snapshotFieldTypeMap;
        }
      }

      return {
        ...payload,
        ...Object.fromEntries(
          Object.entries(overrides || {}).filter(
            ([, value]) => value !== undefined && value !== null,
          ),
        ),
      };
    };

    const excludedTransactions = lockCandidates
      .filter((candidate) => !candidate?.locked)
      .filter((candidate) => !lockSelections[getCandidateKey(candidate)])
      .map((candidate) => {
        const key = getCandidateKey(candidate);
        const info = lockExclusions[key];
        const reason = (info?.reason || '').trim();
        return serializeCandidateForRequest(candidate, { reason });
      })
      .filter(Boolean);
    if (excludedTransactions.some((tx) => !tx.reason)) {
      addToast('Provide a reason for each excluded transaction', 'error');
      return;
    }
    const proposedData = {
      procedure: snapshot?.procedure || result.name,
      parameters: snapshot?.params || result.params,
      transactions: lockCandidates
        .filter((candidate) => lockSelections[getCandidateKey(candidate)])
        .map((candidate) => serializeCandidateForRequest(candidate))
        .filter(Boolean),
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
            {showWorkplaceSelector && (
              <>
                <label style={{ marginLeft: '0.5rem' }}>
                  Workplace
                  <select
                    value={workplaceSelection}
                    onChange={(e) => {
                      workplaceSelectionTouchedRef.current = true;
                      setWorkplaceSelection(e.target.value);
                    }}
                    style={{ marginLeft: '0.25rem' }}
                    ref={workplaceSelectRef}
                    onKeyDown={(event) =>
                      handleParameterKeyDown(event, workplaceSelectRef)
                    }
                  >
                    {workplaceSelectOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {procParams.map((p, i) => {
              if (managedIndices.has(i)) return null;
              if (autoParams[i] !== null) return null;
              const val = manualParams[p] || '';
              const inputRef = manualInputRefs.current[p];
              return (
                <AutoSizingTextInput
                  key={p}
                  type="text"
                  placeholder={p}
                  value={val}
                  onChange={(e) =>
                    handleManualParamChange(p, e.target.value)
                  }
                  style={{ marginLeft: '0.5rem' }}
                  ref={inputRef}
                  onKeyDown={(event) =>
                    handleParameterKeyDown(event, inputRef, p)
                  }
                />
              );
            })}
            <label
              style={{
                marginLeft: '0.5rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <input
                type="checkbox"
                checked={populateLockCandidates}
                onChange={(event) =>
                  setPopulateLockCandidates(event.target.checked)
                }
              />
              <span>Populate lock candidates after running</span>
            </label>
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

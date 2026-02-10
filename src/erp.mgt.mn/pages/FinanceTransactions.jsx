import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';
import ReportTable from '../components/ReportTable.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import { useTxnSession } from '../context/TxnSessionContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import CustomDatePicker from '../components/CustomDatePicker.jsx';
import useButtonPerms from '../hooks/useButtonPerms.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';
import AutoSizingTextInput from '../components/AutoSizingTextInput.jsx';
import { hasTransactionFormAccess } from '../utils/transactionFormAccess.js';
import {
  isModuleLicensed,
  isModulePermissionGranted,
} from '../utils/moduleAccess.js';
import { resolveWorkplacePositionForContext } from '../utils/workplaceResolver.js';

if (typeof window !== 'undefined') {
  window.showTemporaryRequesterUI =
    window.showTemporaryRequesterUI || (() => {});
  window.showTemporaryReviewerUI =
    window.showTemporaryReviewerUI || (() => {});
  window.showTemporaryTransactionsUI =
    window.showTemporaryTransactionsUI || (() => {});
}

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

function getParamName(param) {
  if (!param) return '';
  if (typeof param === 'string') return param;
  if (typeof param === 'object') {
    if (param.name) return param.name;
    if (param.parameterName) return param.parameterName;
  }
  return '';
}

function getParamType(param) {
  if (param && typeof param === 'object') {
    if (typeof param.dataType === 'string') return param.dataType;
    if (typeof param.type === 'string') return param.type;
  }
  return '';
}

function isLikelyDateField(param) {
  const name = getParamName(param);
  const normalized = normalizeParamName(name);
  if (!normalized) return false;
  if (normalized.includes('date')) return true;
  if (DATE_PARAM_ALLOWLIST.has(normalized)) return true;
  const paramType = getParamType(param).toLowerCase();
  if (paramType.includes('date')) return true;
  return false;
}

function isStartDateParam(param) {
  if (!isLikelyDateField(param)) return false;
  const normalized = normalizeParamName(getParamName(param));
  return normalized.includes('start') || normalized.includes('from');
}

function isEndDateParam(param) {
  if (!isLikelyDateField(param)) return false;
  const normalized = normalizeParamName(getParamName(param));
  return normalized.includes('end') || normalized.includes('to');
}

function isEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function resolveModuleKey(info) {
  return info?.moduleKey || info?.module_key || info?.module || info?.modulekey || '';
}

export default function FinanceTransactions({ moduleKey = 'finance_transactions', moduleLabel = '' }) {
  const renderCount = useRef(0);
  renderCount.current++;
  if (renderCount.current > 10) {
    console.warn('⚠️ Excessive renders: FinanceTransactions', renderCount.current);
  }
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const paramKey = useMemo(() => `name_${moduleKey}`, [moduleKey]);
  const [sessionState, setSessionState] = useTxnSession(moduleKey);
  const [name, setName] = useState(() => sessionState.name || searchParams.get(paramKey) || '');
  const [table, setTable] = useState(() => sessionState.table || '');
  const [config, setConfig] = useState(() => sessionState.config || null);
  const [refreshId, setRefreshId] = useState(() => sessionState.refreshId || 0);
  const [showTable, setShowTable] = useState(() =>
    sessionState.showTable || !!sessionState.config,
  );
  const [selectedProc, setSelectedProc] = useState(() => sessionState.selectedProc || '');
  const [startDate, setStartDate] = useState(() =>
    normalizeDateInput(sessionState.startDate || '', 'YYYY-MM-DD'),
  );
  const [endDate, setEndDate] = useState(() =>
    normalizeDateInput(sessionState.endDate || '', 'YYYY-MM-DD'),
  );
  const [datePreset, setDatePreset] = useState(
    () => sessionState.datePreset || 'custom',
  );
  const [procParams, setProcParams] = useState([]);
  const [reportResult, setReportResult] = useState(null);
  const [manualParams, setManualParams] = useState({});
  const [externalTemporaryTrigger, setExternalTemporaryTrigger] = useState(null);
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const {
    company,
    branch,
    department,
    user,
    permissions: perms,
    session,
    workplace,
    workplacePositionMap,
  } =
    useContext(AuthContext);
  const buttonPerms = useButtonPerms();
  const generalConfig = useGeneralConfig();
  const licensed = useCompanyModules(company);
  const tableRef = useRef(null);
  const prevModuleKey = useRef(moduleKey);
  const { addToast } = useToast();
  const mounted = useRef(false);
  const sessionLoaded = useRef(false);
  const prevSessionRef = useRef({});
  const prevConfigRef = useRef(null);
  const controlRefs = useRef([]);
  const prevNameRef = useRef();
  const temporaryProcessedRef = useRef(new Set());
  const planCompletionProcessedRef = useRef(new Set());

  const planCompletionParams = useMemo(() => {
    const openValue = searchParams.get('planOpen') ?? searchParams.get('plan_open');
    if (!openValue) return null;
    const normalizedOpen = String(openValue).toLowerCase();
    const openFlag = !['0', 'false', 'no'].includes(normalizedOpen);
    if (!openFlag) return null;
    const fieldName =
      searchParams.get('planFieldName') ?? searchParams.get('plan_field_name');
    const fieldValue =
      searchParams.get('planFieldValue') ?? searchParams.get('plan_field_value');
    return {
      open: openFlag,
      fieldName: fieldName || '',
      fieldValue: fieldValue ?? '',
      key: `${fieldName || ''}:${fieldValue ?? ''}:${normalizedOpen}`,
    };
  }, [searchParams]);

  const reportProcPrefix = generalConfig?.general?.reportProcPrefix || '';
  const planDefaultValues = useMemo(() => {
    if (!planCompletionParams?.fieldName) return null;
    if (
      planCompletionParams.fieldValue === null ||
      planCompletionParams.fieldValue === undefined ||
      planCompletionParams.fieldValue === ''
    ) {
      return null;
    }
    return {
      [planCompletionParams.fieldName]: planCompletionParams.fieldValue,
    };
  }, [planCompletionParams]);

  const effectiveConfig = useMemo(() => {
    if (!config || !planDefaultValues) return config;
    const nextDefaults = {
      ...(config.defaultValues || {}),
      ...planDefaultValues,
    };
    if (isEqual(nextDefaults, config.defaultValues || {})) {
      return config;
    }
    return {
      ...config,
      defaultValues: nextDefaults,
    };
  }, [config, planDefaultValues]);

  const availableProcedures = useMemo(() => {
    const formConfig = configs[name];
    if (!formConfig || typeof formConfig !== 'object') return [];
    const { procedures } = formConfig;
    if (!Array.isArray(procedures) || procedures.length === 0) return [];
    const normalized = procedures.filter((proc) => typeof proc === 'string');
    if (!reportProcPrefix) return normalized;
    const prefixLower = reportProcPrefix.toLowerCase();
    return normalized.filter((proc) => proc.toLowerCase().includes(prefixLower));
  }, [configs, name, reportProcPrefix]);

  const procMap = useHeaderMappings(
    availableProcedures.length > 0
      ? [...availableProcedures, selectedProc].filter(Boolean)
      : selectedProc
      ? [selectedProc]
      : [],
  );

  function getProcLabel(name) {
    return (
      generalConfig.general?.procLabels?.[name] || procMap[name] || name
    );
  }


  useEffect(() => {
    console.log('FinanceTransactions render monitor effect');
    if (process.env.NODE_ENV !== 'production') {
      renderCount.current++;
      if (renderCount.current > 5) console.warn('Excessive re-renders');
    }
  }, []);

  useEffect(() => {
    if (mounted.current) return;
    console.log('FinanceTransactions mount effect');
    mounted.current = true;
  }, []);

  
  useEffect(() => {
    console.log('FinanceTransactions moduleKey effect');
    if (prevModuleKey.current !== moduleKey) {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete(`name_${prevModuleKey.current}`);
        return sp;
      });
    }
    prevModuleKey.current = moduleKey;
  }, [moduleKey]);

  // load stored session for this module
  // load stored session for this module
useEffect(() => {
  if (sessionLoaded.current) return;
  console.log('FinanceTransactions load session effect');

  const next = {
    name: sessionState.name || '',
    table: sessionState.table || '',
    config: sessionState.config || null,
    refreshId: sessionState.refreshId || 0,
    showTable: sessionState.showTable || !!sessionState.config,
    selectedProc: sessionState.selectedProc || '',
    startDate: sessionState.startDate || '',
    endDate: sessionState.endDate || '',
    datePreset: sessionState.datePreset || 'custom',
  };

  if (!isEqual(prevSessionRef.current, next)) {
    setName(next.name);
    setTable(next.table);
    setConfig(next.config);
    setRefreshId(next.refreshId);
    setShowTable(next.showTable);
    setSelectedProc(next.selectedProc);
    setStartDate(normalizeDateInput(next.startDate, 'YYYY-MM-DD'));
    setEndDate(normalizeDateInput(next.endDate, 'YYYY-MM-DD'));
    setDatePreset(next.datePreset);
    prevSessionRef.current = next;
  }

  sessionLoaded.current = true;
}, [moduleKey]);


  // persist state to session
  useEffect(() => {
    console.log('FinanceTransactions persist session effect');
    setSessionState({
      name,
      table,
      config,
      refreshId,
      showTable,
      selectedProc,
      startDate,
      endDate,
      datePreset,
    });
  }, [name, table, config, refreshId, showTable, selectedProc, startDate, endDate, datePreset]);

  useEffect(() => {
    console.log('FinanceTransactions search param effect');
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (name) sp.set(paramKey, name);
      else sp.delete(paramKey);
      return sp;
    });
  }, [name, paramKey]);

  useEffect(() => {
    const paramValue = searchParams.get(paramKey) || '';
    if (!planCompletionParams?.open) return;
    if (!paramValue || paramValue === name || name === '') return;
    setName(paramValue);
  }, [name, paramKey, planCompletionParams, searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const setParamPair = (params, camelKey, value) => {
      const snakeKey = camelKey
        .replace(/([A-Z])/g, (match) => `_${match.toLowerCase()}`)
        .toLowerCase();
      if (value) {
        params.set(camelKey, value);
        params.set(snakeKey, value);
      } else {
        params.delete(camelKey);
        params.delete(snakeKey);
      }
    };

    const buildTemporaryPayload = (scope, rawOptions = {}) => {
      const opts = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
      const normalizedScope = scope || opts.scope || 'created';
      const normalizedModule = opts.module || opts.moduleKey || moduleKey || '';
      const normalizedForm = opts.form || opts.formName || opts.config || '';
      const normalizedConfig = opts.config || opts.configName || opts.form || '';
      const normalizedTable =
        opts.table ||
        opts.tableName ||
        opts.table_name ||
        table ||
        '';
      const normalizedId =
        opts.id ??
        opts.recordId ??
        opts.record_id ??
        opts.submissionId ??
        opts.submission_id ??
        opts.temporaryId ??
        opts.temporary_id ??
        '';

      const payload = {
        open: true,
        scope: normalizedScope,
        module: normalizedModule,
        form: normalizedForm,
        config: normalizedConfig,
        table: normalizedTable,
        id: normalizedId ? String(normalizedId) : '',
      };

      const keySource =
        opts.key ||
        opts.signature ||
        `${normalizedModule}:${normalizedForm}:${normalizedConfig}:${normalizedTable}:${payload.id}:${normalizedScope}`;
      payload.key = `${keySource}:${Date.now()}`;

      return payload;
    };

    const applyTemporaryTrigger = (scope, rawOptions = {}) => {
      const payload = buildTemporaryPayload(scope, rawOptions);
      setExternalTemporaryTrigger(payload);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          setParamPair(next, 'temporaryOpen', '1');
          setParamPair(next, 'temporaryScope', payload.scope || '');
          setParamPair(next, 'temporaryModule', payload.module || '');
          setParamPair(next, 'temporaryForm', payload.form || '');
          setParamPair(next, 'temporaryConfig', payload.config || '');
          setParamPair(next, 'temporaryTable', payload.table || '');
          setParamPair(next, 'temporaryId', payload.id || '');
          setParamPair(next, 'temporaryKey', payload.key || '');
          return next;
        },
        { replace: true },
      );
    };

    const showRequester = (options = {}) => applyTemporaryTrigger('created', options);
    const showReviewer = (options = {}) => applyTemporaryTrigger('review', options);
    const showTemporary = (options = {}) =>
      applyTemporaryTrigger(options.scope || options.targetScope || 'created', options);

    window.showTemporaryRequesterUI = showRequester;
    window.showTemporaryReviewerUI = showReviewer;
    window.showTemporaryTransactionsUI = showTemporary;

    return () => {
      if (window.showTemporaryRequesterUI === showRequester) {
        window.showTemporaryRequesterUI = () => {};
      }
      if (window.showTemporaryReviewerUI === showReviewer) {
        window.showTemporaryReviewerUI = () => {};
      }
      if (window.showTemporaryTransactionsUI === showTemporary) {
        window.showTemporaryTransactionsUI = () => {};
      }
    };
  }, [moduleKey, setExternalTemporaryTrigger, setSearchParams, table]);

  const pendingTemporary = useMemo(() => {
    const openValue =
      searchParams.get('temporaryOpen') ?? searchParams.get('temporary_open');
    if (!openValue) return null;
    const scopeValue =
      searchParams.get('temporaryScope') ?? searchParams.get('temporary_scope');
    const moduleValue =
      searchParams.get('temporaryModule') ?? searchParams.get('temporary_module');
    const formValue =
      searchParams.get('temporaryForm') ?? searchParams.get('temporary_form');
    const configValue =
      searchParams.get('temporaryConfig') ?? searchParams.get('temporary_config');
    const tableValue =
      searchParams.get('temporaryTable') ?? searchParams.get('temporary_table');
    const idValue =
      searchParams.get('temporaryId') ?? searchParams.get('temporary_id');
    const keyValue =
      searchParams.get('temporaryKey') ?? searchParams.get('temporary_key');
    const normalizedOpen = String(openValue).toLowerCase();
    const openFlag = !['0', 'false', 'no'].includes(normalizedOpen);
    return {
      open: openFlag,
      scope: scopeValue || '',
      module: moduleValue || '',
      form: formValue || '',
      config: configValue || '',
      table: tableValue || '',
      id: idValue || '',
      key:
        keyValue ||
        `${moduleValue || ''}:${formValue || ''}:${configValue || ''}:${tableValue || ''}:${idValue || ''}:${normalizedOpen}`,
    };
  }, [searchParams]);

  useEffect(() => {
    console.log('FinanceTransactions load forms effect');
    let canceled = false;
    setConfigsLoaded(false);
    const params = new URLSearchParams();
    if (moduleKey) params.set('moduleKey', moduleKey);
    if (branch != null) params.set('branchId', branch);
    if (department != null) params.set('departmentId', department);
    const userRightId =
      user?.userLevel ??
      user?.userlevel_id ??
      user?.userlevelId ??
      session?.user_level ??
      session?.userlevel_id ??
      session?.userlevelId ??
      null;
    const userRightName =
      session?.user_level_name ??
      session?.userLevelName ??
      user?.userLevelName ??
      user?.userlevel_name ??
      user?.userlevelName ??
      null;
  const workplaceId =
    workplace ??
    session?.workplace_id ??
    session?.workplaceId ??
    null;
  const workplacePositionId =
    resolveWorkplacePositionForContext({
      workplaceId,
      session,
      workplacePositionMap,
    })?.positionId ??
    session?.workplace_position_id ??
    session?.workplacePositionId ??
    null;
    const positionId =
      session?.employment_position_id ??
      session?.position_id ??
      session?.position ??
      user?.position ??
      null;
    if (userRightId != null && `${userRightId}`.trim() !== '') {
      params.set('userRightId', userRightId);
    }
    if (workplaceId != null && `${workplaceId}`.trim() !== '') {
      params.set('workplaceId', workplaceId);
    }
    if (positionId != null && `${positionId}`.trim() !== '') {
      params.set('positionId', positionId);
    }
    if (workplacePositionId != null && `${workplacePositionId}`.trim() !== '') {
      params.set('workplacePositionId', workplacePositionId);
    }
    const query = params.toString();
    const url = `/api/transaction_forms${query ? `?${query}` : ''}`;
    fetch(url, { credentials: 'include', skipLoader: true })
      .then((res) => {
        if (canceled) return {};
        if (!res.ok) {
          addToast('Failed to load transaction forms', 'error');
          return {};
        }
        return res.json().catch(() => {
          addToast('Failed to parse transaction forms', 'error');
          return {};
        });
      })
      .then((data) => {
        if (canceled) return;
        const filtered = {};
        const branchId = branch != null ? String(branch) : null;
        const departmentId = department != null ? String(department) : null;
        Object.entries(data).forEach(([n, info]) => {
          if (n === 'isDefault') return;
          if (!info || typeof info !== 'object') return;
          const mKey = resolveModuleKey(info);
          if (mKey !== moduleKey) return;
          if (
            !hasTransactionFormAccess(info, branchId, departmentId, {
              allowTemporaryAnyScope: true,
              userRightId,
              userRightName,
              workplaceId,
              positionId,
              workplacePositions: session?.workplace_assignments,
              workplacePositionId,
              workplacePositionMap,
            })
          )
            return;
          if (!isModuleLicensed(licensed, mKey))
            return;
          filtered[n] = info;
        });
        setConfigs(filtered);
        if (name && filtered[name]) {
          const tbl = filtered[name].table ?? filtered[name];
          if (tbl !== table) setTable(tbl);
        }
      })
      .catch(() => {
        if (!canceled) {
          addToast('Failed to load transaction forms', 'error');
          setConfigs({});
        }
      })
      .finally(() => {
        if (!canceled) setConfigsLoaded(true);
      });
    return () => {
      canceled = true;
    };
  }, [
    moduleKey,
    company,
    branch,
    department,
    perms,
    licensed,
    session,
    user,
    workplace,
    workplacePositionMap,
  ]);

  useEffect(() => {
    console.log('FinanceTransactions table sync effect');
    if (!name) {
      if (table !== '') setTable('');
      if (config !== null) setConfig(null);
      if (showTable) setShowTable(false);
      return;
    }
    if (configs[name]) {
      const tbl = configs[name].table ?? configs[name];
      if (tbl !== table) {
        setTable(tbl);
        if (config !== null) setConfig(null);
        if (showTable) setShowTable(false);
      }
    }
  }, [name, configs]);

  useEffect(() => {
    console.log('FinanceTransactions configs empty effect');
    if (Object.keys(configs).length === 0) {
      setName('');
      if (table !== '') setTable('');
      if (config !== null) setConfig(null);
      if (showTable) setShowTable(false);
    }
  }, [configs]);

  useEffect(() => {
    console.log('FinanceTransactions fetch config effect');
    if (!table || !name) {
      if (config !== null) setConfig(null);
      return;
    }
    let canceled = false;
    fetch(
      `/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`,
      { credentials: 'include', skipLoader: true },
    )
      .then((res) => {
        if (canceled) return null;
        if (!res.ok) {
          addToast('Failed to load transaction configuration', 'error');
          return null;
        }
        return res.json().catch(() => null);
      })
      .then((cfg) => {
        if (canceled) return;
        if (cfg && cfg.moduleKey) {
          const prefix = reportProcPrefix;
          let nextCfg = cfg;
          if (prefix && Array.isArray(cfg.procedures)) {
            nextCfg = {
              ...cfg,
              procedures: cfg.procedures.filter((p) =>
                p.toLowerCase().includes(prefix.toLowerCase()),
              ),
            };
          }
          if (!isEqual(nextCfg, prevConfigRef.current)) {
            setConfig(nextCfg);
            prevConfigRef.current = nextCfg;
          }
          setShowTable(true);
        } else {
          if (config !== null) setConfig(null);
          setShowTable(false);
          addToast('Transaction configuration not found', 'error');
        }
      })
      .catch(() => {
        if (!canceled) {
          if (config !== null) setConfig(null);
          setShowTable(false);
          addToast('Failed to load transaction configuration', 'error');
        }
      });
    return () => {
      canceled = true;
    };
  }, [table, name, addToast, reportProcPrefix]);

  useEffect(() => {
    if (!pendingTemporary?.open) return;
    if (pendingTemporary.module && pendingTemporary.module !== moduleKey) return;
    const configEntries = Object.entries(configs);
    if (configEntries.length === 0) return;

    const processed = temporaryProcessedRef.current;
    const signature = `${pendingTemporary.key}::${moduleKey}`;
    if (processed.has(signature)) return;

    const normalizeLookupValue = (value) =>
      String(value ?? '')
        .trim()
        .toLowerCase();

    const normalizedTable = normalizeLookupValue(pendingTemporary.table);

    let targetName = '';
    const normalizedCandidateNames = [pendingTemporary.form, pendingTemporary.config]
      .map(normalizeLookupValue)
      .filter(Boolean);

    const normalizedNameMap = new Map(
      configEntries.map(([cfgName]) => [normalizeLookupValue(cfgName), cfgName]),
    );

    for (const candidate of normalizedCandidateNames) {
      const matchedName = normalizedNameMap.get(candidate);
      if (matchedName) {
        targetName = matchedName;
        break;
      }
    }

    if (!targetName && normalizedTable) {
      const match = configEntries.find(([cfgName, cfgValue]) => {
        const candidateTable =
          (cfgValue && typeof cfgValue === 'object'
            ? cfgValue.table ?? cfgValue.tableName ?? cfgValue.table_name
            : cfgValue) || '';
        if (!candidateTable) return false;
        return normalizeLookupValue(candidateTable) === normalizedTable;
      });
      if (match) targetName = match[0];
    }

    if (!targetName) {
      if (name) {
        targetName = name;
      } else if (configEntries.length > 0) {
        targetName = configEntries[0][0];
      }
    }

    if (!targetName) return;

    if (targetName !== name) {
      setName(targetName);
    }

    setShowTable(true);
    setExternalTemporaryTrigger({
      key: signature,
      scope: pendingTemporary.scope || 'review',
      table: pendingTemporary.table || '',
      id: pendingTemporary.id ? String(pendingTemporary.id) : undefined,
      open: true,
    });

    processed.add(signature);

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('temporaryOpen');
        next.delete('temporary_open');
        next.delete('temporaryScope');
        next.delete('temporary_scope');
        next.delete('temporaryModule');
        next.delete('temporary_module');
        next.delete('temporaryForm');
        next.delete('temporary_form');
        next.delete('temporaryConfig');
        next.delete('temporary_config');
        next.delete('temporaryTable');
        next.delete('temporary_table');
        next.delete('temporaryId');
        next.delete('temporary_id');
        next.delete('temporaryKey');
        next.delete('temporary_key');
        return next;
      },
      { replace: true },
    );
  }, [
    configs,
    moduleKey,
    name,
    pendingTemporary,
    setSearchParams,
    setShowTable,
    setName,
  ]);

  useEffect(() => {
    if (!planCompletionParams?.open) return;
    if (!table || !effectiveConfig || !showTable) return;
    if (!tableRef.current?.openAdd) return;
    const processed = planCompletionProcessedRef.current;
    const signature = `${planCompletionParams.key}::${moduleKey}::${table}`;
    if (processed.has(signature)) return;
    processed.add(signature);
    setTimeout(() => {
      tableRef.current?.openAdd();
    }, 0);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('planOpen');
        next.delete('plan_open');
        next.delete('planFieldName');
        next.delete('plan_field_name');
        next.delete('planFieldValue');
        next.delete('plan_field_value');
        return next;
      },
      { replace: true },
    );
  }, [
    planCompletionParams,
    table,
    effectiveConfig,
    showTable,
    moduleKey,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!selectedProc) {
      setProcParams([]);
      setManualParams({});
      return;
    }
    fetch(`/api/procedures/${encodeURIComponent(selectedProc)}/params`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { parameters: [] }))
      .then((data) => setProcParams(data.parameters || []))
      .catch(() => setProcParams([]));
  }, [selectedProc]);

  useEffect(() => {
    if (prevNameRef.current === name) return;
    prevNameRef.current = name;
    setSelectedProc('');
    setStartDate('');
    setEndDate('');
    setDatePreset('custom');
    setManualParams({});
    setProcParams([]);
    setReportResult(null);
    setConfig(null);
    prevConfigRef.current = null;
  }, [name]);

  useEffect(() => {
    setReportResult(null);
    setManualParams({});
  }, [selectedProc, name]);


  const transactionNames = useMemo(() => Object.keys(configs), [configs]);
  const dateParamInfo = useMemo(() => {
    const info = {
      hasStartDateParam: false,
      hasEndDateParam: false,
      managedIndices: new Set(),
      startIndices: new Set(),
      endIndices: new Set(),
    };
    procParams.forEach((param, index) => {
      if (!getParamName(param)) return;
      if (isStartDateParam(param)) {
        info.hasStartDateParam = true;
        info.managedIndices.add(index);
        info.startIndices.add(index);
      }
      if (isEndDateParam(param)) {
        info.hasEndDateParam = true;
        info.managedIndices.add(index);
        info.endIndices.add(index);
      }
    });
    return info;
  }, [procParams]);

  const { hasStartDateParam, hasEndDateParam, managedIndices, startIndices, endIndices } =
    dateParamInfo;
  const hasDateParams = hasStartDateParam || hasEndDateParam;

  useEffect(() => {
    if (!selectedProc) return;
    const timer = setTimeout(() => {
      const nodes = controlRefs.current.filter(
        (node) => node && typeof node.focus === 'function',
      );
      if (nodes.length > 0) {
        nodes[0].focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedProc, procParams, hasDateParams, hasStartDateParam, hasEndDateParam]);

  const autoParams = useMemo(() => {
    return procParams.map((p, index) => {
      if (startIndices.has(index)) return startDate || null;
      if (endIndices.has(index)) return endDate || null;
      const normalized = normalizeParamName(getParamName(p));
      if (normalized.includes('branch')) return branch || null;
      if (normalized.includes('company')) return company ?? null;
      if (normalized.includes('user') || normalized.includes('emp'))
        return user?.empid ?? null;
      return null;
    });
  }, [procParams, startIndices, endIndices, startDate, endDate, company, branch, user]);

  const finalParams = useMemo(() => {
    return procParams.map((p, i) => {
      const auto = autoParams[i];
      const key = getParamName(p) || String(i);
      return auto ?? manualParams[key] ?? null;
    });
  }, [procParams, autoParams, manualParams]);

  const allParamsProvided = useMemo(
    () => finalParams.every((v) => v !== null && v !== ''),
    [finalParams],
  );

  function handlePresetChange(e) {
    const value = e.target.value;
    setDatePreset(value);
    if (value === 'custom') return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let start = '', end = '';
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
    if (hasStartDateParam) {
      setStartDate(normalizeDateInput(fmt(start), 'YYYY-MM-DD'));
    }
    if (hasEndDateParam) {
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
      const key = getParamName(p) || String(i);
      acc[key] = finalParams[i];
      return acc;
    }, {});
    const label = getProcLabel(selectedProc);
    addToast(`Calling ${label}`, 'info');
    try {
      const res = await fetch('/api/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: selectedProc, params: finalParams }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({ row: [] }));
        const rows = Array.isArray(data.row) ? data.row : [];
        addToast(
          `${label} returned ${rows.length} row${rows.length === 1 ? '' : 's'}`,
          'success',
        );
        setReportResult({
          name: selectedProc,
          params: paramMap,
          rows,
          fieldTypeMap: data.fieldTypeMap || {},
          fieldLineage: data.fieldLineage || {},
        });
      } else {
        addToast('Failed to run procedure', 'error');
      }
    } catch {
      addToast('Failed to run procedure', 'error');
    }
  }

  if (!perms || !licensed) return <p>Ачааллаж байна...</p>;
  const moduleLicensed = isModuleLicensed(licensed, moduleKey);
  const modulePermitted = isModulePermissionGranted(perms, moduleKey);
  const hasConfigs = Object.keys(configs).length > 0;
  if (!moduleLicensed)
    return <p>Нэвтрэх эрхгүй.</p>;
  if (!modulePermitted && !configsLoaded) return <p>Ачааллаж байна...</p>;
  if (!modulePermitted && configsLoaded && !hasConfigs) return <p>Нэвтрэх эрхгүй.</p>;

  const caption = 'Гүйлгээ сонгоно уу';

  controlRefs.current = [];

  function registerControlRef() {
    const index = controlRefs.current.length;
    controlRefs.current[index] = null;
    return (node) => {
      controlRefs.current[index] = node;
    };
  }

  function handleControlKeyDown(event) {
    if (event.key !== 'Enter') return;
    const nodes = controlRefs.current.filter(
      (node) => node && typeof node.focus === 'function',
    );
    const currentIndex = nodes.indexOf(event.currentTarget);
    if (currentIndex === -1) return;
    event.preventDefault();
    const nextIndex = currentIndex + 1;
    if (nextIndex < nodes.length) {
      nodes[nextIndex].focus();
    } else {
      runReport();
    }
  }

  return (
    <div>
      <h2>{moduleLabel || 'Гүйлгээ'}</h2>
        {transactionNames.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ maxWidth: '300px' }}>
              <select
                value={name}
                onChange={(e) => {
                  const newName = e.target.value;
                  if (newName === name) return;
                  setName(newName);
                  setRefreshId((r) => r + 1);
                  setShowTable(true);
                  if (!newName) {
                    if (table !== '') setTable('');
                    if (config !== null) setConfig(null);
                  } else if (configs[newName]) {
                    const tbl = configs[newName].table ?? configs[newName];
                    if (tbl !== table) {
                      setTable(tbl);
                      if (config !== null) setConfig(null);
                    }
                  }
                }}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '3px', border: '1px solid #ccc' }}
              >
                <option value="">{caption}</option>
                {transactionNames.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {availableProcedures.length > 0 && (
              <div style={{ marginLeft: '1rem' }}>
                <span style={{ marginRight: '0.5rem' }}>REPORTS</span>
                <select
                  value={selectedProc}
                  onChange={(e) => setSelectedProc(e.target.value)}
                >
                  <option value="">-- select --</option>
                  {availableProcedures.map((p) => (
                    <option key={p} value={p}>
                      {getProcLabel(p)}
                    </option>
                  ))}
                </select>
                {selectedProc && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {hasDateParams && (
                      <select
                        value={datePreset}
                        onChange={handlePresetChange}
                        style={{ marginRight: '0.5rem' }}
                        ref={registerControlRef()}
                        onKeyDown={handleControlKeyDown}
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
                    {hasStartDateParam && (
                      <CustomDatePicker
                        value={startDate}
                        onChange={(v) => {
                          setStartDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                          setDatePreset('custom');
                        }}
                        inputRef={registerControlRef()}
                        onKeyDown={handleControlKeyDown}
                      />
                    )}
                    {hasEndDateParam && (
                      <CustomDatePicker
                        value={endDate}
                        onChange={(v) => {
                          setEndDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                          setDatePreset('custom');
                        }}
                        style={{ marginLeft: hasStartDateParam ? '0.5rem' : undefined }}
                        inputRef={registerControlRef()}
                        onKeyDown={handleControlKeyDown}
                      />
                    )}
                    {procParams.map((p, i) => {
                      if (managedIndices.has(i)) return null;
                      if (autoParams[i] !== null) return null;
                      const name = getParamName(p);
                      const key = name || String(i);
                      const val = manualParams[key] || '';
                      return (
                        <AutoSizingTextInput
                          key={key}
                          type="text"
                          placeholder={name}
                          value={val}
                          onChange={(e) =>
                            setManualParams((m) => ({ ...m, [key]: e.target.value }))
                          }
                          style={{ marginLeft: '0.5rem' }}
                          ref={registerControlRef()}
                          onKeyDown={handleControlKeyDown}
                        />
                      );
                    })}
                    <button
                      onClick={runReport}
                      style={{ marginLeft: '0.5rem' }}
                      disabled={!allParamsProvided}
                      ref={registerControlRef()}
                      onKeyDown={handleControlKeyDown}
                    >
                      Run
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      {table && effectiveConfig && (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            {buttonPerms['New transaction'] && (
              <button
                onClick={() => tableRef.current?.openAdd()}
                style={{ marginRight: '0.5rem' }}
              >
                Гүйлгээ нэмэх
              </button>
            )}
            <button onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Хүснэгт нуух' : 'Хүснэгт харах'}
            </button>
          </div>
          <TableManager
            key={`${moduleKey}-${name}`}
            ref={tableRef}
            table={table}
            refreshId={refreshId}
            formConfig={effectiveConfig}
            allConfigs={configs}
            formName={name}
            initialPerPage={10}
            addLabel="Гүйлгээ нэмэх"
            showTable={showTable}
            buttonPerms={buttonPerms}
            externalTemporaryTrigger={externalTemporaryTrigger}
          />
        </>
      )}
      {reportResult && (
        <ReportTable
          procedure={reportResult.name}
          params={reportResult.params}
          rows={reportResult.rows}
          buttonPerms={buttonPerms}
          fieldTypeMap={reportResult.fieldTypeMap}
          fieldLineage={reportResult.fieldLineage}
          enableRowSelection={true}
        />
      )}
      {transactionNames.length === 0 && (
        <p>Гүйлгээ тохируулаагүй байна.</p>
      )}
    </div>
  );
}

import React, {
  useEffect,
  useState,
  useContext,
  useMemo,
  useImperativeHandle,
  forwardRef,
  useRef,
  useCallback,
  memo,
} from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import RowFormModal from './RowFormModal.jsx';
import CascadeDeleteModal from './CascadeDeleteModal.jsx';
import RowDetailModal from './RowDetailModal.jsx';
import RowImageViewModal from './RowImageViewModal.jsx';
import RowImageUploadModal from './RowImageUploadModal.jsx';
import ImageSearchModal from './ImageSearchModal.jsx';
import Modal from './Modal.jsx';
import CustomDatePicker from './CustomDatePicker.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import buildImageName from '../utils/buildImageName.js';
import slugify from '../utils/slugify.js';
import { getTenantKeyList } from '../utils/tenantKeys.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';
import { useTranslation } from 'react-i18next';
import TooltipWrapper from './TooltipWrapper.jsx';
import normalizeDateInput from '../utils/normalizeDateInput.js';
import {
  applyGeneratedColumnEvaluators,
  createGeneratedColumnEvaluator,
  valuesEqual,
} from '../utils/generatedColumns.js';

function ch(n) {
  return Math.round(n * 8);
}

function logRowsMemory(rows) {
    if (process.env.NODE_ENV === 'production') return;
    try {
      const sizeMB = JSON.stringify(rows).length / 1024 / 1024;
    const timestamp = formatTimestamp(new Date());
      const message = `Loaded ${rows.length} transactions (~${sizeMB.toFixed(2)} MB) at ${timestamp}`;
      if (!window.memoryLogs) window.memoryLogs = [];
      if (window.memoryLogs.length >= 20) {
        window.memoryLogs.shift(); // remove oldest
      }
      window.memoryLogs.push(message);
      if (window.erpDebug) {
        if (sizeMB > 10 || rows.length > 10000) {
          console.warn(message);
        } else {
          console.log(message);
        }
      }
    } catch (err) {
      console.error('Failed to compute memory usage', err);
    }
}

function sanitizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, '_');
}

function buildColumnCaseMap(columns) {
  const map = {};
  if (!Array.isArray(columns)) return map;
  columns.forEach((c) => {
    if (!c?.name) return;
    const canonical = String(c.name);
    const lower = canonical.toLowerCase();
    map[lower] = canonical;
    const stripped = lower.replace(/_/g, '');
    if (!map[stripped]) {
      map[stripped] = canonical;
    }
  });
  return map;
}

function resolveWithMap(alias, map = {}) {
  if (alias == null) return alias;
  const strAlias = typeof alias === 'string' ? alias : String(alias);
  const lower = strAlias.toLowerCase();
  if (map && map[lower]) return map[lower];
  const stripped = lower.replace(/_/g, '');
  if (map && map[stripped]) return map[stripped];
  return strAlias;
}

const MAX_WIDTH = ch(40);

const currencyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function applyDateParams(params, filter) {
  if (!filter) return;
  const rangeMatch = filter.match(
    /^(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/,
  );
  if (rangeMatch) {
    params.set('date_from', `${rangeMatch[1]} 00:00:00`);
    params.set('date_to', `${rangeMatch[2]} 23:59:59`);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) {
    params.set('date_from', `${filter} 00:00:00`);
    params.set('date_to', `${filter} 23:59:59`);
  }
}

const actionCellStyle = {
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  whiteSpace: 'nowrap',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.25rem',
};
const actionBtnStyle = {
  background: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  fontSize: '0.8rem',
  padding: '0.25rem 0.5rem',
  cursor: 'pointer',
};
const deleteBtnStyle = {
  ...actionBtnStyle,
  backgroundColor: '#fee2e2',
  borderColor: '#fecaca',
  color: '#b91c1c',
};

const requestStatusColors = {
  pending: '#fef9c3',
  accepted: '#d1fae5',
  approved: '#d1fae5',
  declined: '#fee2e2',
};

const requestStatusLabels = {
  pending: 'Pending',
  accepted: 'Approved',
  approved: 'Approved',
  declined: 'Declined',
};

function coalesce(obj, ...keys) {
  if (!obj) return undefined;
  for (const key of keys) {
    if (key == null) continue;
    if (Array.isArray(key)) {
      const nested = coalesce(obj, ...key);
      if (nested !== undefined && nested !== null && nested !== '') {
        return nested;
      }
      continue;
    }
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
    const camel = key
      .toString()
      .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      .replace(/^[A-Z]/, (c) => c.toLowerCase());
    if (
      obj[camel] !== undefined &&
      obj[camel] !== null &&
      obj[camel] !== ''
    ) {
      return obj[camel];
    }
    const snake = key
      .toString()
      .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
      .replace(/^_/, '');
    if (
      obj[snake] !== undefined &&
      obj[snake] !== null &&
      obj[snake] !== ''
    ) {
      return obj[snake];
    }
  }
  return undefined;
}

function formatMetaDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatTimestamp(date);
}

const TableManager = forwardRef(function TableManager({
  table,
  refreshId = 0,
  formConfig = null,
  allConfigs = {},
  formName = '',
  initialPerPage = 10,
  addLabel = 'Мөр нэмэх',
  showTable = true,
  buttonPerms = {},
  autoFillSession = true,
}, ref) {
  const { t } = useTranslation(['translation', 'tooltip']);
  const mounted = useRef(false);
  const renderCount = useRef(0);
  const warned = useRef(false);

  renderCount.current++;
  if (renderCount.current > 10 && !warned.current) {
    console.warn(`⚠️ Excessive renders: TableManager ${renderCount.current}`);
    warned.current = true;
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (window.erpDebug) console.warn('✅ Mounted: TableManager');
    }
  }, []);
  
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ column: '', dir: 'asc' });
  const [relations, setRelations] = useState({});
  const [refData, setRefData] = useState({});
  const [refRows, setRefRows] = useState({});
  const [relationConfigs, setRelationConfigs] = useState({});
  const [columnMeta, setColumnMeta] = useState([]);
  const [autoInc, setAutoInc] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [rowDefaults, setRowDefaults] = useState({});
  const [gridRows, setGridRows] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [localRefresh, setLocalRefresh] = useState(0);
  const [procTriggers, setProcTriggers] = useState({});
  const [lockMetadataById, setLockMetadataById] = useState({});
  const lockSignatureRef = useRef('');
  const [temporarySummary, setTemporarySummary] = useState(null);
  const [temporaryScope, setTemporaryScope] = useState('created');
  const [temporaryList, setTemporaryList] = useState([]);
  const [showTemporaryModal, setShowTemporaryModal] = useState(false);
  const [temporaryLoading, setTemporaryLoading] = useState(false);
  const handleRowsChange = useCallback((rs) => {
    setGridRows(rs);
    if (!Array.isArray(rs) || rs.length === 0) return;
    setEditing((prev) => {
      const firstRow = rs[0];
      if (!firstRow || typeof firstRow !== 'object') return prev;
      const base = prev ? { ...prev } : {};
      let changed = false;
      Object.entries(firstRow).forEach(([key, value]) => {
        if (!Object.is(base[key], value)) {
          base[key] = value;
          changed = true;
        }
      });
      return changed ? base : prev;
    });
  }, []);
  const [deleteInfo, setDeleteInfo] = useState(null); // { id, refs }
  const [showCascade, setShowCascade] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [detailRefs, setDetailRefs] = useState([]);
  const [imagesRow, setImagesRow] = useState(null);
  const [uploadRow, setUploadRow] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, value }
  const [searchTerm, setSearchTerm] = useState('');
  const [searchImages, setSearchImages] = useState([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [viewDisplayMap, setViewDisplayMap] = useState({});
  const [viewColumns, setViewColumns] = useState({});
  const [editLabels, setEditLabels] = useState(false);
  const [labelEdits, setLabelEdits] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [requestType, setRequestType] = useState(null);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const reasonResolveRef = useRef(null);
  const [dateFilter, setDateFilter] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [typeOptions, setTypeOptions] = useState([]);
  const [requestStatus, setRequestStatus] = useState('');
  const [requestIdSet, setRequestIdSet] = useState(new Set());
  const requestIdsKey = useMemo(
    () => Array.from(requestIdSet).sort().join(','),
    [requestIdSet],
  );
  const { user, company, branch, department, session } = useContext(AuthContext);
  const isSubordinate = Boolean(
    session?.senior_empid || session?.senior_plan_empid,
  );
  const generalConfig = useGeneralConfig();
  const { addToast } = useToast();
  const canRequestStatus = isSubordinate;

  function promptRequestReason() {
    return new Promise((resolve) => {
      reasonResolveRef.current = resolve;
      setRequestReason('');
      setShowReasonModal(true);
    });
  }

  function submitRequestReason() {
    if (!requestReason.trim()) {
      addToast(
        t('request_reason_required', 'Request reason is required'),
        'error',
      );
      return;
    }
    reasonResolveRef.current(requestReason);
    setShowReasonModal(false);
  }

  function cancelRequestReason() {
    reasonResolveRef.current(null);
    setShowReasonModal(false);
  }

  useEffect(() => {
    function hideMenu() {
      setCtxMenu(null);
    }
    window.addEventListener('click', hideMenu);
    return () => window.removeEventListener('click', hideMenu);
  }, []);

  const refreshTemporarySummary = useCallback(async () => {
    if (!supportsTemporary) {
      setTemporarySummary(null);
      setTemporaryScope('created');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/transaction_temporaries/summary`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setTemporarySummary(data);
      if (data?.reviewPending > 0) {
        setTemporaryScope('review');
      } else {
        setTemporaryScope('created');
      }
    } catch {
      setTemporarySummary((prev) => prev || { createdPending: 0, reviewPending: 0 });
    }
  }, [supportsTemporary]);

  const validCols = useMemo(() => new Set(columnMeta.map((c) => c.name)), [columnMeta]);
  const columnCaseMap = useMemo(
    () => buildColumnCaseMap(columnMeta),
    [columnMeta],
  );

  const resolveCanonicalKey = useCallback(
    (alias, caseMap) => {
      return resolveWithMap(alias, caseMap || columnCaseMap);
    },
    [columnCaseMap],
  );

  const normalizeToCanonical = useCallback(
    (source, caseMap) => {
      if (!source || typeof source !== 'object') return {};
      const normalized = {};
      const map = caseMap || columnCaseMap;
      for (const [rawKey, value] of Object.entries(source)) {
        const canonicalKey = resolveCanonicalKey(rawKey, map);
        normalized[canonicalKey] = value;
      }
      return normalized;
    },
    [columnCaseMap, resolveCanonicalKey],
  );

  const normalizeTenantKey = useCallback(
    (alias, caseMap) => {
      if (alias == null) return null;
      const canonical = resolveCanonicalKey(alias, caseMap);
      if (!canonical) return null;
      return sanitizeName(canonical).replace(/_/g, '');
    },
    [resolveCanonicalKey],
  );

  const hasTenantKey = useCallback(
    (tenantInfo, key, caseMap) => {
      if (!tenantInfo) return false;
      const target = normalizeTenantKey(key, caseMap);
      if (!target) return false;
      const keys = getTenantKeyList(tenantInfo);
      for (const rawKey of keys) {
        const normalized = normalizeTenantKey(rawKey, caseMap);
        if (normalized && normalized === target) return true;
      }
      return false;
    },
    [normalizeTenantKey],
  );

  const appendTenantParam = useCallback(
    (params, tenantKey, caseMap, value, canonicalOverride) => {
      if (!params || value == null || value === '') return;
      const canonicalKey =
        canonicalOverride ?? resolveCanonicalKey(tenantKey, caseMap);
      const snakeKey = sanitizeName(tenantKey);
      if (canonicalKey) {
        params.set(canonicalKey, value);
      }
      if (snakeKey && snakeKey !== canonicalKey) {
        params.set(snakeKey, value);
      }
    },
    [resolveCanonicalKey],
  );

  const fieldTypeMap = useMemo(() => {
    const map = {};
    columnMeta.forEach((c) => {
      const typ = (c.type || c.columnType || c.dataType || c.DATA_TYPE || '')
        .toLowerCase();
      if (typ.match(/int|decimal|numeric|double|float|real|number|bigint/)) {
        map[c.name] = 'number';
      } else if (typ.includes('timestamp') || typ.includes('datetime')) {
        map[c.name] = 'datetime';
      } else if (typ.includes('date')) {
        map[c.name] = 'date';
      } else if (typ.includes('time')) {
        map[c.name] = 'time';
      } else {
        map[c.name] = 'string';
      }
    });
    return map;
  }, [columnMeta]);

  const generatedCols = useMemo(
    () =>
      new Set(
        columnMeta
          .filter(
            (c) =>
              typeof c.extra === 'string' &&
              /(virtual|stored)\s+generated/i.test(c.extra),
          )
          .map((c) => c.name),
      ),
    [columnMeta],
  );

  const generatedColumnEvaluators = useMemo(() => {
    if (!Array.isArray(columnMeta) || columnMeta.length === 0) return {};
    const evaluators = {};
    columnMeta.forEach((col) => {
      if (!col || typeof col !== 'object') return;
      const rawName = col.name;
      const expr =
        col.generationExpression ??
        col.GENERATION_EXPRESSION ??
        col.generation_expression ??
        null;
      if (!rawName || !expr) return;
      const key = resolveCanonicalKey(rawName);
      if (typeof key !== 'string') return;
      const evaluator = createGeneratedColumnEvaluator(expr, columnCaseMap);
      if (evaluator) evaluators[key] = evaluator;
    });
    return evaluators;
  }, [columnMeta, columnCaseMap, resolveCanonicalKey]);

  const viewSourceMap = useMemo(() => {
    const map = {};
    Object.entries(formConfig?.viewSource || {}).forEach(([k, v]) => {
      const key = resolveCanonicalKey(k);
      map[key] = v;
    });
    return map;
  }, [formConfig?.viewSource, resolveCanonicalKey]);

  const branchIdFields = useMemo(() => {
    if (formConfig?.branchIdFields?.length)
      return formConfig.branchIdFields.filter(f => validCols.has(f));
    return ['branch_id'].filter(f => validCols.has(f));
  }, [formConfig, validCols]);

  const departmentIdFields = useMemo(() => {
    if (formConfig?.departmentIdFields?.length)
      return formConfig.departmentIdFields.filter(f => validCols.has(f));
    return ['department_id'].filter(f => validCols.has(f));
  }, [formConfig, validCols]);

  const companyIdFields = useMemo(() => {
    if (formConfig?.companyIdFields?.length)
      return formConfig.companyIdFields.filter(f => validCols.has(f));
    return ['company_id'].filter(f => validCols.has(f));
  }, [formConfig, validCols]);

  const userIdFields = useMemo(() => {
    if (formConfig?.userIdFields?.length)
      return formConfig.userIdFields.filter(f => validCols.has(f));
    const defaultFields = ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'];
    return defaultFields.filter(f => validCols.has(f));
  }, [formConfig, validCols]);

  const supportsTemporary = useMemo(() => {
    if (!formConfig) return false;
    const flag =
      formConfig.supportsTemporarySubmission ??
      formConfig.allowTemporarySubmission ??
      false;
    return Boolean(flag);
  }, [formConfig]);

  function computeAutoInc(meta) {
    const auto = meta
      .filter(
        (c) =>
          typeof c.extra === 'string' &&
          c.extra.toLowerCase().includes('auto_increment'),
      )
      .map((c) => c.name);
    if (auto.length === 0) {
      const pk = meta.filter((c) => c.key === 'PRI').map((c) => c.name);
      if (pk.length === 1) return new Set(pk);
    }
    return new Set(auto);
  }

  function getAverageLength(columnKey, data) {
    const values = data
      .slice(0, 20)
      .map((r) => (r[columnKey] ?? '').toString());
    if (values.length === 0) return 0;
    return Math.round(
      values.reduce((sum, val) => sum + val.length, 0) / values.length,
    );
  }

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    setRows([]);
    setCount(0);
    setPage(1);
    setFilters({});
    setSort({ column: '', dir: 'asc' });
    setRelations({});
    setRefData({});
    setColumnMeta([]);
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) {
          addToast(
            t('failed_load_table_columns', 'Failed to load table columns'),
            'error',
          );
          return [];
        }
        return res.json().catch(() => {
          addToast(
            t('failed_parse_table_columns', 'Failed to parse table columns'),
            'error',
          );
          return [];
        });
      })
      .then((cols) => {
        if (canceled) return;
        if (Array.isArray(cols)) {
          setColumnMeta(cols);
          setAutoInc(computeAutoInc(cols));
        }
      })
      .catch(() => {
        addToast(
          t('failed_load_table_columns', 'Failed to load table columns'),
          'error',
        );
      });
    return () => {
      canceled = true;
    };
  }, [table]);

  useEffect(() => {
    refreshTemporarySummary();
  }, [refreshTemporarySummary, table, refreshId]);

  useEffect(() => {
    const views = Array.from(new Set(Object.values(viewSourceMap)));
    if (views.length === 0) {
      setViewDisplayMap({});
      setViewColumns({});
      return;
    }
    let canceled = false;
    views.forEach((v) => {
      fetch(`/api/display_fields?table=${encodeURIComponent(v)}`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((cfg) => {
          if (canceled) return;
          setViewDisplayMap((m) => ({ ...m, [v]: cfg || {} }));
        })
        .catch(() => {});
      fetch(`/api/tables/${encodeURIComponent(v)}/columns`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((cols) => {
          if (canceled) return;
          const list = Array.isArray(cols)
            ? cols.map((c) => ({
                ...c,
                generationExpression:
                  c?.generationExpression ?? c?.GENERATION_EXPRESSION ?? null,
              }))
            : [];
          setViewColumns((m) => ({ ...m, [v]: list }));
        })
        .catch(() => {});
    });
    return () => {
      canceled = true;
    };
  }, [viewSourceMap]);

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    fetch(`/api/proc_triggers?table=${encodeURIComponent(table)}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (!canceled) setProcTriggers(data || {});
      })
      .catch(() => {
        if (!canceled) setProcTriggers({});
      });
    return () => {
      canceled = true;
    };
  }, [table]);

  useEffect(() => {
    setAutoInc(computeAutoInc(columnMeta));
  }, [columnMeta]);

  useEffect(() => {
    if (!formConfig) return;
    const newFilters = {};
    if (formConfig.dateField && formConfig.dateField.length > 0) {
      const today = formatTimestamp(new Date()).slice(0, 10);
      setDateFilter(today);
      setCustomStartDate('');
      setCustomEndDate('');
      setDatePreset('custom');
      formConfig.dateField.forEach((d) => {
        if (validCols.has(d)) newFilters[d] = today;
      });
    } else {
      setDateFilter('');
      setCustomStartDate('');
      setCustomEndDate('');
      setDatePreset('custom');
    }
    if (formConfig.transactionTypeField) {
      const val = formConfig.transactionTypeValue || '';
      setTypeFilter(val);
      if (validCols.has(formConfig.transactionTypeField))
        newFilters[formConfig.transactionTypeField] = val;
    } else {
      setTypeFilter('');
    }
    if (company !== undefined && companyIdFields.length > 0) {
      companyIdFields.forEach((f) => {
        if (validCols.has(f)) newFilters[f] = company;
      });
    }
    if (branch !== undefined && branchIdFields.length > 0) {
      branchIdFields.forEach((f) => {
        if (validCols.has(f)) newFilters[f] = branch;
      });
    }
    if (department !== undefined && departmentIdFields.length > 0) {
      departmentIdFields.forEach((f) => {
        if (validCols.has(f)) newFilters[f] = department;
      });
    }
    if (user?.empid !== undefined && userIdFields.length > 0) {
      userIdFields.forEach((f) => {
        if (validCols.has(f)) newFilters[f] = user.empid;
      });
    }
    if (Object.keys(newFilters).length > 0) {
      setFilters((f) => ({ ...f, ...newFilters }));
    }
  }, [formConfig, validCols, user, company, branch, department]);

  useEffect(() => {
    if (!formConfig?.transactionTypeField) {
      setTypeOptions([]);
      return;
    }
    let canceled = false;
    fetch('/api/tables/code_transaction?perPage=500', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {
          addToast(
            t('failed_load_transaction_types', 'Failed to load transaction types'),
            'error',
          );
          return { rows: [] };
        }
        return res.json().catch(() => {
          addToast(
            t('failed_parse_transaction_types', 'Failed to parse transaction types'),
            'error',
          );
          return { rows: [] };
        });
      })
      .then((data) => {
        if (canceled) return;
        const opts = (data.rows || []).map((r) => ({
          value: r.UITransType?.toString() ?? '',
          label:
            r.UITransType !== undefined
              ? `${r.UITransType} - ${r.UITransTypeName ?? ''}`
              : r.UITransTypeName,
        }));
        setTypeOptions(opts);
      })
      .catch(() => {
        if (!canceled) {
          addToast(
            t('failed_load_transaction_types', 'Failed to load transaction types'),
            'error',
          );
          setTypeOptions([]);
        }
      });
    return () => {
      canceled = true;
    };
  }, [formConfig]);

  useEffect(() => {
    if (datePreset === 'custom') {
      if (customStartDate && customEndDate) {
        setDateFilter(`${customStartDate}-${customEndDate}`);
      } else {
        setDateFilter('');
      }
    }
  }, [customStartDate, customEndDate, datePreset]);

  useEffect(() => {
    if (formConfig?.dateField && formConfig.dateField.length > 0) {
      setFilters((f) => {
        const obj = { ...f };
        formConfig.dateField.forEach((d) => {
          if (validCols.has(d)) obj[d] = dateFilter || '';
        });
        return obj;
      });
    }
  }, [dateFilter, formConfig, validCols]);

  useEffect(() => {
    if (formConfig?.transactionTypeField) {
      if (validCols.has(formConfig.transactionTypeField)) {
        setFilters((f) => ({
          ...f,
          [formConfig.transactionTypeField]: typeFilter || '',
        }));
      }
    }
  }, [typeFilter, formConfig, validCols]);

  useEffect(() => {
    async function loadRequests() {
      if (!requestStatus) {
        setRequestIdSet(new Set());
        return;
      }
      try {
        const params = new URLSearchParams({
          status: requestStatus,
          senior_empid: user?.empid,
          table_name: table,
        });
        // Parse date filter into date_from/date_to if provided
        applyDateParams(params, dateFilter);
        params.set('per_page', '1000');
        const res = await fetch(
          `/api/pending_request?${params.toString()}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const data = await res.json().catch(() => ({ rows: [] }));
          const list = Array.isArray(data) ? data : data.rows || [];
          const ids = new Set(
            list
              .filter((r) => r.table_name === table)
              .map((r) => String(r.record_id)),
          );
          setRequestIdSet(ids);
          setCount(
            Array.isArray(data)
              ? ids.size
              : data.total ?? data.count ?? ids.size,
          );
        } else {
          setRequestIdSet(new Set());
          setCount(0);
        }
      } catch {
        setRequestIdSet(new Set());
        setCount(0);
      }
    }
    loadRequests();
  }, [requestStatus, table, user?.empid, dateFilter]);

  useEffect(() => {
    if (!table || Object.keys(columnCaseMap).length === 0) return;
    let canceled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/relations`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          addToast(
            t('failed_load_table_relations', 'Failed to load table relations'),
            'error',
          );
          return;
        }
        const rels = await res.json().catch(() => {
          addToast(
            t('failed_parse_table_relations', 'Failed to parse table relations'),
            'error',
          );
          return [];
        });
        if (canceled) return;
        const map = {};
        rels.forEach((r) => {
          const key = resolveCanonicalKey(r.COLUMN_NAME);
          map[key] = {
            table: r.REFERENCED_TABLE_NAME,
            column: r.REFERENCED_COLUMN_NAME,
          };
        });
        setRelations(map);
        const dataMap = {};
        const cfgMap = {};
        const rowMap = {};
        for (const [col, rel] of Object.entries(map)) {
          try {
            let page = 1;
            const perPage = 500;
            let rows = [];

            const cfgRes = await fetch(
              `/api/display_fields?table=${encodeURIComponent(rel.table)}`,
              { credentials: 'include' },
            );
            let cfg = null;
            if (cfgRes.ok) {
              try {
                cfg = await cfgRes.json();
              } catch {
                addToast(
                  t('failed_parse_display_fields', 'Failed to parse display fields'),
                  'error',
                );
                cfg = null;
              }
            } else {
              addToast(
                t('failed_load_display_fields', 'Failed to load display fields'),
                'error',
              );
            }

            let tenantInfo = null;
            try {
              const ttRes = await fetch(
                `/api/tenant_tables/${encodeURIComponent(rel.table)}`,
                { credentials: 'include' },
              );
              if (ttRes.ok) {
                tenantInfo = await ttRes.json().catch(() => null);
              }
            } catch {
              /* ignore tenant table fetch errors */
            }
            const isShared =
              tenantInfo?.isShared ?? tenantInfo?.is_shared ?? false;
            const tenantKeys = getTenantKeyList(tenantInfo);

            while (true) {
              const params = new URLSearchParams({ page, perPage });
              if (!isShared) {
                if (tenantKeys.includes('company_id') && company != null)
                  params.set('company_id', company);
                if (tenantKeys.includes('branch_id') && branch != null)
                  params.set('branch_id', branch);
                if (tenantKeys.includes('department_id') && department != null)
                  params.set('department_id', department);
              }
              const refRes = await fetch(
                `/api/tables/${encodeURIComponent(rel.table)}?${params.toString()}`,
                { credentials: 'include' },
              );
              if (!refRes.ok) {
                addToast(
                  t('failed_load_reference_data', 'Failed to load reference data'),
                  'error',
                );
                break;
              }
              const json = await refRes.json().catch(() => {
                addToast(
                  t('failed_parse_reference_data', 'Failed to parse reference data'),
                  'error',
                );
                return {};
              });
              if (Array.isArray(json.rows)) {
                rows = rows.concat(json.rows);
                if (
                  rows.length >= (json.count || rows.length) ||
                  json.rows.length < perPage
                ) {
                  break;
                }
              } else {
                break;
              }
              page += 1;
            }
            cfgMap[col] = {
              table: rel.table,
              column: rel.column,
              idField: cfg?.idField ?? rel.column,
              displayFields: cfg?.displayFields || [],
            };
            if (rows.length > 0) {
              rowMap[col] = {};
              dataMap[col] = rows.map((row) => {
                const keyMap = {};
                Object.keys(row).forEach((k) => {
                  keyMap[k.toLowerCase()] = k;
                });
                const parts = [];
                const valKey = keyMap[rel.column.toLowerCase()];
                const val = valKey ? row[valKey] : undefined;

                const idFieldName = cfg?.idField ?? rel.column;
                const idKey =
                  typeof idFieldName === 'string'
                    ? keyMap[idFieldName.toLowerCase()]
                    : undefined;
                const identifier = idKey ? row[idKey] : undefined;

                if (identifier !== undefined) {
                  parts.push(identifier);
                } else if (val !== undefined) {
                  parts.push(val);
                }

                let displayFields = [];
                if (
                  cfg &&
                  Array.isArray(cfg.displayFields) &&
                  cfg.displayFields.length > 0
                ) {
                  displayFields = cfg.displayFields;
                } else {
                  displayFields = Object.keys(row)
                    .filter((f) => f !== rel.column)
                    .slice(0, 1);
                }

                parts.push(
                  ...displayFields
                    .map((f) => {
                      const rk = keyMap[f.toLowerCase()];
                      return rk ? row[rk] : undefined;
                    })
                    .filter((v) => v !== undefined),
                );

                const label =
                  parts.length > 0
                    ? parts.join(' - ')
                    : Object.values(row).slice(0, 2).join(' - ');

                if (val !== undefined) {
                  rowMap[col][val] = row;
                }
                return {
                  value: val,
                  label,
                };
              });
            }
          } catch {
            /* ignore */
          }
        }
        if (!canceled) {
          setRefData(dataMap);
          setRefRows(rowMap);
          const remap = {};
          Object.entries(cfgMap).forEach(([k, v]) => {
            const key = resolveCanonicalKey(k);
            remap[key] = v;
          });
          setRelationConfigs(remap);
        }
      } catch (err) {
        console.error('Failed to load table relations', err);
        addToast(
          t('failed_load_table_relations', 'Failed to load table relations'),
          'error',
        );
      }
    }
    load();
    return () => {
      canceled = true;
    };
  }, [table, company, branch, department, resolveCanonicalKey]);

  useEffect(() => {
    if (!table || columnMeta.length === 0) return;
    let canceled = false;
    const params = new URLSearchParams({ page, perPage });
    if (company != null && validCols.has('company_id'))
      params.set('company_id', company);
    if (sort.column && validCols.has(sort.column)) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined && validCols.has(k))
        params.set(k, v);
    });
    fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
      credentials: 'include',
    })
      .then((res) => {
        if (canceled) return { rows: [], count: 0 };
        if (!res.ok) {
          addToast(
            t('failed_load_table_data', 'Failed to load table data'),
            'error',
          );
          return { rows: [], count: 0 };
        }
        return res.json().catch(() => {
          if (!canceled)
            addToast(
              t('failed_parse_table_data', 'Failed to parse table data'),
              'error',
            );
          return { rows: [], count: 0 };
        });
      })
      .then((data) => {
        if (canceled) return;
        let rows = data.rows || [];
        if (requestStatus) {
          rows = rows.filter((r) => requestIdSet.has(String(getRowId(r))));
        }
        setRows(rows);
        if (!requestStatus) {
          setCount(data.total ?? data.count ?? 0);
        }
        // clear selections when data changes
        setSelectedRows(new Set());
        logRowsMemory(rows);
      })
      .catch(() => {
        if (!canceled)
          addToast(
            t('failed_load_table_data', 'Failed to load table data'),
            'error',
          );
      });
    return () => {
      canceled = true;
    };
  }, [
    table,
    page,
    perPage,
    filters,
    sort,
    refreshId,
    localRefresh,
    columnMeta,
    validCols,
    requestStatus,
    requestIdsKey,
  ]);

  useEffect(() => {
    setSelectedRows(new Set());
  }, [table, page, perPage, filters, sort, refreshId, localRefresh]);

  useEffect(() => {
    if (!table || !Array.isArray(rows) || rows.length === 0) {
      if (lockSignatureRef.current) lockSignatureRef.current = '';
      if (Object.keys(lockMetadataById).length > 0) {
        setLockMetadataById({});
      }
      return;
    }
    const lockedEntries = rows.reduce((acc, row) => {
      if (!row || !row.locked) return acc;
      const id = getRowId(row);
      if (id === undefined || id === null) return acc;
      const idStr = String(id);
      const versionParts = [
        coalesce(row, 'lock_version', 'lockVersion', 'lock_updated_at', 'lockUpdatedAt'),
        coalesce(row, 'locked_at', 'lockedAt'),
        coalesce(row, 'request_status', 'requestStatus'),
      ]
        .filter((v) => v !== undefined && v !== null && v !== '')
        .map(String);
      acc.push({
        id: idStr,
        version: versionParts.join('|'),
      });
      return acc;
    }, []);
    const lockedIds = lockedEntries.map((entry) => entry.id).sort();
    const versionSignature = lockedEntries
      .map((entry) => `${entry.id}:${entry.version}`)
      .sort()
      .join(',');
    const signature = `${table}::${company ?? ''}::${versionSignature}`;
    if (!lockedIds.length) {
      if (lockSignatureRef.current !== signature) {
        lockSignatureRef.current = signature;
      }
      if (Object.keys(lockMetadataById).length > 0) {
        setLockMetadataById({});
      }
      return;
    }
    if (lockSignatureRef.current === signature) return;
    lockSignatureRef.current = signature;
    let canceled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set('table_name', table);
        lockedIds.forEach((id) => params.append('record_id', id));
        if (company !== undefined && company !== null && company !== '') {
          params.set('company_id', company);
        }
        const res = await fetch(
          `${API_BASE}/report_transaction_locks/metadata?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load lock metadata');
        const data = await res.json().catch(() => ({}));
        if (canceled) return;
        const list = Array.isArray(data) ? data : data.rows || [];
        const map = {};
        list.forEach((item) => {
          const recordId = coalesce(item, 'record_id', 'recordId', 'id');
          if (recordId === undefined || recordId === null || recordId === '') {
            return;
          }
          map[String(recordId)] = item;
        });
        setLockMetadataById(map);
      } catch (err) {
        if (!canceled) {
          lockSignatureRef.current = '';
          setLockMetadataById({});
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [rows, table, company, lockMetadataById]);

  function getRowId(row) {
    const keys = getKeyFields();
    if (keys.length === 0) return undefined;
    if (keys.length === 1) {
      return row[keys[0]];
    }
    try {
      return JSON.stringify(keys.map((k) => row[k]));
    } catch (err) {
      console.error('Failed to build composite row id', err);
      return keys.map((k) => row[k]).join('-');
    }
  }

  function getImageFolder(row) {
    const lower = {};
    Object.keys(row || {}).forEach((k) => {
      lower[k.toLowerCase()] = row[k];
    });
    const t1 = lower['trtype'];
    const t2 =
      lower['uitranstypename'] || lower['transtype'] || lower['transtypename'];
    if (!t1 || !t2) return table;
    return `${slugify(t1)}/${slugify(String(t2))}`;
  }

  function getCase(obj, field) {
    if (!obj) return undefined;
    if (obj[field] !== undefined) return obj[field];
    const canonical = resolveCanonicalKey(field);
    if (canonical != null && obj[canonical] !== undefined) return obj[canonical];
    const lower = String(field).toLowerCase();
    const key = Object.keys(obj).find((k) => String(k).toLowerCase() === lower);
    return key ? obj[key] : undefined;
  }

  function getConfigForRow(row) {
    if (!row) return formConfig || {};
    const tVal =
      getCase(row, 'transtype') ||
      getCase(row, 'Transtype') ||
      getCase(row, 'UITransType') ||
      getCase(row, 'UITransTypeName');
    for (const cfg of Object.values(allConfigs || {})) {
      if (!cfg.transactionTypeValue) continue;
      if (tVal !== undefined && String(tVal) === String(cfg.transactionTypeValue)) {
        return cfg;
      }
      if (cfg.transactionTypeField) {
        const val = getCase(row, cfg.transactionTypeField);
        if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
          return cfg;
        }
      } else {
        const matchField = Object.keys(row).find(
          (k) => String(getCase(row, k)) === String(cfg.transactionTypeValue),
        );
        if (matchField) return { ...cfg, transactionTypeField: matchField };
      }
    }
    return formConfig || {};
  }

  function getKeyFields() {
    const withPrimaryOrdinals = columnMeta
      .map((column, index) => {
        const rawOrdinal = column?.primaryKeyOrdinal;
        const numericOrdinal =
          rawOrdinal != null && Number.isFinite(Number(rawOrdinal))
            ? Number(rawOrdinal)
            : null;
        return { column, index, ordinal: numericOrdinal };
      })
      .filter(({ ordinal }) => ordinal != null);
    if (withPrimaryOrdinals.length > 0) {
      return withPrimaryOrdinals
        .sort((a, b) => {
          if (a.ordinal === b.ordinal) return a.index - b.index;
          return a.ordinal - b.ordinal;
        })
        .map(({ column }) => column.name);
    }

    const withCandidateOrdinals = columnMeta
      .map((column, index) => {
        const rawOrdinal = column?.candidateKeyOrdinal;
        const numericOrdinal =
          rawOrdinal != null && Number.isFinite(Number(rawOrdinal))
            ? Number(rawOrdinal)
            : null;
        return { column, index, ordinal: numericOrdinal };
      })
      .filter(({ ordinal }) => ordinal != null);
    if (withCandidateOrdinals.length > 0) {
      return withCandidateOrdinals
        .sort((a, b) => {
          if (a.ordinal === b.ordinal) return a.index - b.index;
          return a.ordinal - b.ordinal;
        })
        .map(({ column }) => column.name);
    }

    const keyedColumns = columnMeta
      .map((column, index) => ({ column, index }))
      .filter(({ column }) => column?.key === 'PRI');
    if (keyedColumns.length > 0) {
      return keyedColumns
        .sort((a, b) => a.index - b.index)
        .map(({ column }) => column.name);
    }

    if (columnMeta.some((c) => c.name === 'id')) return ['id'];
    if (rows[0] && Object.prototype.hasOwnProperty.call(rows[0], 'id')) {
      return ['id'];
    }
    return [];
  }

  async function ensureColumnMeta() {
    if (!table) return [];
    if (columnMeta.length > 0) return columnMeta;
    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
        credentials: 'include',
      });
      if (!res.ok) {
        addToast(
          t('failed_load_table_columns', 'Failed to load table columns'),
          'error',
        );
        return [];
      }
      try {
        const cols = await res.json();
        if (Array.isArray(cols)) {
          setColumnMeta(cols);
          setAutoInc(computeAutoInc(cols));
          return cols;
        }
      } catch {
        addToast(
          t('failed_parse_table_columns', 'Failed to parse table columns'),
          'error',
        );
      }
    } catch (err) {
      console.error('Failed to fetch column metadata', err);
      addToast(
        t('failed_load_table_columns', 'Failed to load table columns'),
        'error',
      );
    }
    return columnMeta;
  }

  async function openAdd() {
    const meta = await ensureColumnMeta();
    const cols = Array.isArray(meta) && meta.length > 0 ? meta : columnMeta;
    const defaults = {};
    const baseRow = {};
    cols.forEach((c) => {
      const name = c.name;
      const isGenerated =
        typeof c?.extra === 'string' && /(virtual|stored)\s+generated/i.test(c.extra);
      let v = (formConfig?.defaultValues || {})[name] || '';
      if (autoFillSession && !isGenerated) {
        if (userIdFields.includes(name) && user?.empid) v = user.empid;
        if (branchIdFields.includes(name) && branch !== undefined) v = branch;
        if (departmentIdFields.includes(name) && department !== undefined) v = department;
        if (companyIdFields.includes(name) && company !== undefined) v = company;
      }
      baseRow[name] = v;
      defaults[name] = v;
      if (!v && formConfig?.dateField?.includes(name)) {
        const typ = fieldTypeMap[name];
        const now = new Date();
        if (typ === 'datetime') {
          defaults[name] = formatTimestamp(now);
        } else if (typ === 'date') {
          defaults[name] = formatTimestamp(now).slice(0, 10);
        } else if (typ === 'time') {
          defaults[name] = formatTimestamp(now).slice(11, 19);
        }
      }
    });
    if (formConfig?.transactionTypeField && formConfig.transactionTypeValue) {
      baseRow[formConfig.transactionTypeField] = formConfig.transactionTypeValue;
      defaults[formConfig.transactionTypeField] = formConfig.transactionTypeValue;
    }
    const initialRows = [{ ...baseRow, _saved: false }];
    if (Object.keys(generatedColumnEvaluators).length > 0) {
      const { changed } = applyGeneratedColumnEvaluators({
        targetRows: initialRows,
        evaluators: generatedColumnEvaluators,
        equals: valuesEqual,
      });
      if (changed && initialRows[0]) {
        Object.assign(baseRow, initialRows[0]);
      }
    }
    setRowDefaults(defaults);
    setEditing(baseRow);
    setGridRows(initialRows);
    setIsAdding(true);
    setShowForm(true);
  }

  async function openEdit(row) {
    if (getRowId(row) === undefined) {
      addToast(
        t('cannot_edit_without_pk', 'Cannot edit rows without a primary key'),
        'error',
      );
      return;
    }
    const meta = await ensureColumnMeta();
    const cols = Array.isArray(meta) && meta.length > 0 ? meta : columnMeta;
    const localCaseMap =
      Array.isArray(cols) && cols.length > 0
        ? buildColumnCaseMap(cols)
        : columnCaseMap;
    const id = getRowId(row);
    addToast(t('loading_record', 'Loading record...'));

    const normalizedRow = normalizeToCanonical(row, localCaseMap);

    let tenantInfo = null;
    try {
      const ttRes = await fetch(
        `/api/tenant_tables/${encodeURIComponent(table)}`,
        { credentials: 'include' },
      );
      if (ttRes.ok) {
        tenantInfo = await ttRes.json().catch(() => null);
      }
    } catch {
      tenantInfo = null;
    }

    const params = new URLSearchParams();
    if (tenantInfo && !(tenantInfo.isShared ?? tenantInfo.is_shared)) {
      if (hasTenantKey(tenantInfo, 'company_id', localCaseMap)) {
        const companyKey = resolveCanonicalKey('company_id', localCaseMap);
        const rowCompanyId =
          companyKey != null ? normalizedRow[companyKey] : normalizedRow.company_id;
        appendTenantParam(
          params,
          'company_id',
          localCaseMap,
          rowCompanyId,
          companyKey,
        );
      }
      if (hasTenantKey(tenantInfo, 'branch_id', localCaseMap)) {
        const branchKey = resolveCanonicalKey('branch_id', localCaseMap);
        const rowBranchId =
          branchKey != null ? normalizedRow[branchKey] : normalizedRow.branch_id;
        appendTenantParam(
          params,
          'branch_id',
          localCaseMap,
          rowBranchId,
          branchKey,
        );
      }
      if (hasTenantKey(tenantInfo, 'department_id', localCaseMap)) {
        const departmentKey = resolveCanonicalKey('department_id', localCaseMap);
        const rowDepartmentId =
          departmentKey != null
            ? normalizedRow[departmentKey]
            : normalizedRow.department_id;
        appendTenantParam(
          params,
          'department_id',
          localCaseMap,
          rowDepartmentId,
          departmentKey,
        );
      }
    }

    const url = `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    let payload = null;
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load record');
      payload = await res.json().catch(() => null);
    } catch (err) {
      addToast(t('failed_load_record', 'Failed to load record details'), 'error');
      return;
    }

    let record = null;
    if (payload && typeof payload === 'object') {
      if (!Array.isArray(payload) && payload.data && typeof payload.data === 'object') {
        record = payload.data;
      } else if (!Array.isArray(payload)) {
        record = payload;
      }
    }

    if (!record) {
      addToast(t('failed_load_record', 'Failed to load record details'), 'error');
      return;
    }

    const normalizedRecord = normalizeToCanonical(record, localCaseMap);
    const mergedRow = { ...normalizedRow };
    for (const [key, value] of Object.entries(normalizedRecord)) {
      mergedRow[key] = value;
    }

    setEditing(mergedRow);
    setGridRows([mergedRow]);
    setIsAdding(false);
    setShowForm(true);
  }

  async function openRequestEdit(row) {
    if (getRowId(row) === undefined) {
      addToast(
        t('cannot_edit_without_pk', 'Cannot edit rows without a primary key'),
        'error',
      );
      return;
    }
    await ensureColumnMeta();
    setEditing(row);
    setGridRows([row]);
    setIsAdding(false);
    setRequestType('edit');
    setShowForm(true);
  }

  useImperativeHandle(ref, () => ({
    openAdd: buttonPerms['New transaction'] ? openAdd : () => {},
  }));

  async function openDetail(row) {
    setDetailRow(row);
    const meta = await ensureColumnMeta();
    const cols = Array.isArray(meta) && meta.length > 0 ? meta : columnMeta;
    const localCaseMap =
      Array.isArray(cols) && cols.length > 0
        ? buildColumnCaseMap(cols)
        : columnCaseMap;
    const normalizedRow = normalizeToCanonical(row, localCaseMap);
    const id = getRowId(row);
    if (id !== undefined) {
      let tenantInfo = null;
      try {
        const ttRes = await fetch(
          `/api/tenant_tables/${encodeURIComponent(table)}`,
          { credentials: 'include' },
        );
        if (ttRes.ok) {
          tenantInfo = await ttRes.json().catch(() => null);
        }
      } catch {
        tenantInfo = null;
      }
      try {
        const params = new URLSearchParams();
        if (tenantInfo && !(tenantInfo.isShared ?? tenantInfo.is_shared)) {
          if (hasTenantKey(tenantInfo, 'company_id', localCaseMap)) {
            const companyKey = resolveCanonicalKey('company_id', localCaseMap);
            const rowCompanyId =
              companyKey != null
                ? normalizedRow[companyKey]
                : normalizedRow.company_id;
            appendTenantParam(
              params,
              'company_id',
              localCaseMap,
              rowCompanyId,
              companyKey,
            );
          }
          if (hasTenantKey(tenantInfo, 'branch_id', localCaseMap)) {
            const branchKey = resolveCanonicalKey('branch_id', localCaseMap);
            const rowBranchId =
              branchKey != null ? normalizedRow[branchKey] : normalizedRow.branch_id;
            appendTenantParam(
              params,
              'branch_id',
              localCaseMap,
              rowBranchId,
              branchKey,
            );
          }
          if (hasTenantKey(tenantInfo, 'department_id', localCaseMap)) {
            const departmentKey = resolveCanonicalKey('department_id', localCaseMap);
            const rowDepartmentId =
              departmentKey != null
                ? normalizedRow[departmentKey]
                : normalizedRow.department_id;
            appendTenantParam(
              params,
              'department_id',
              localCaseMap,
              rowDepartmentId,
              departmentKey,
            );
          }
        }
        const url = `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references${
          params.toString() ? `?${params.toString()}` : ''
        }`;
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
          try {
            const refs = await res.json();
            setDetailRefs(Array.isArray(refs) ? refs : []);
          } catch {
            addToast(
              t('failed_parse_reference_info', 'Failed to parse reference info'),
              'error',
            );
            setDetailRefs([]);
          }
        } else {
          addToast(
            t('failed_load_reference_info', 'Failed to load reference info'),
            'error',
          );
          setDetailRefs([]);
        }
      } catch {
        addToast(
          t('failed_load_reference_info', 'Failed to load reference info'),
          'error',
        );
        setDetailRefs([]);
      }
    } else {
      setDetailRefs([]);
    }
    setShowDetail(true);
  }

  function openImages(row) {
    setImagesRow(row);
  }

  function openUpload(row) {
    setUploadRow(row);
  }

  function openContextMenu(e, value) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, value });
  }

  async function loadSearch(term, pg = 1) {
    const params = new URLSearchParams({ page: pg, pageSize: 20 });
    try {
      const res = await fetch(
        `/api/transaction_images/search/${encodeURIComponent(term)}?${params.toString()}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSearchImages(data.files || []);
        setSearchPage(data.page || pg);
        setSearchTotal(data.total ?? data.count ?? 0);
        setSearchTerm(term);
        setShowSearch(true);
      } else {
        addToast(
          t('failed_search_images', 'Failed to search images'),
          'error',
        );
      }
    } catch {
      addToast(
        t('failed_search_images', 'Failed to search images'),
        'error',
      );
    }
  }

  function toggleRow(id) {
    setSelectedRows((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectCurrentPage() {
    setSelectedRows(new Set(rows.map((r) => getRowId(r)).filter((id) => id !== undefined)));
  }

  function deselectAll() {
    setSelectedRows(new Set());
  }

  function handleFieldChange(changes) {
    if (!editing) return;
    setEditing((e) => {
      const next = { ...e, ...changes };
      Object.entries(changes).forEach(([field, val]) => {
        const conf = relationConfigs[field];
        let value = val;
        if (value && typeof value === 'object' && 'value' in value) {
          value = value.value;
        }
        if (conf && conf.displayFields && refRows[field]?.[value]) {
          const row = refRows[field][value];
          const rowKeyMap = {};
          Object.keys(row).forEach((k) => {
            rowKeyMap[k.toLowerCase()] = k;
          });
          conf.displayFields.forEach((df) => {
            const key = resolveCanonicalKey(df);
            const rk = rowKeyMap[df.toLowerCase()];
            if (key && rk && row[rk] !== undefined) {
              next[key] = row[rk];
            }
          });
        }
      });
      if (Object.keys(generatedColumnEvaluators).length === 0) {
        return next;
      }
      const workingRows = [{ ...next }];
      const { changed } = applyGeneratedColumnEvaluators({
        targetRows: workingRows,
        evaluators: generatedColumnEvaluators,
        equals: valuesEqual,
      });
      return changed ? workingRows[0] : next;
    });
    Object.entries(changes).forEach(([field, val]) => {
      const view = viewSourceMap[field];
      if (!view || val === '') return;
      const params = new URLSearchParams({ perPage: 1, debug: 1 });
      const cols = viewColumns[view] || [];
      const colNames = cols.map((c) => (typeof c === 'string' ? c : c.name));
      if (company != null && colNames.includes('company_id'))
        params.set('company_id', company);
      Object.entries(viewSourceMap).forEach(([f, v]) => {
        if (v !== view) return;
        if (!colNames.includes(f)) return;
        let pv = changes[f];
        if (pv === undefined) pv = editing?.[f];
        if (pv === undefined || pv === '') return;
        if (typeof pv === 'object' && 'value' in pv) pv = pv.value;
        params.set(f, pv);
      });
      const url = `/api/tables/${encodeURIComponent(view)}?${params.toString()}`;
      addToast(
        t('lookup_params', 'Lookup {{view}}: {{params}}', {
          view,
          params: params.toString(),
        }),
        'info',
      );
      fetch(url, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
            addToast(
              t('no_view_rows_found', 'No view rows found'),
              'error',
            );
            return;
          }
          addToast(
            t('sql_query', 'SQL: {{query}}', { query: data.sql }),
            'info',
          );
          const row = data.rows[0];
          addToast(
            t('sql_result', 'Result: {{result}}', {
              result: JSON.stringify(row),
            }),
            'info',
          );
          setEditing((e) => {
            if (!e) return e;
            const updated = { ...e };
            Object.entries(row).forEach(([k, v]) => {
              const key = resolveCanonicalKey(k);
              if (key && updated[key] === undefined) {
                updated[key] = v;
              }
            });
            return updated;
          });
        })
        .catch((err) => {
          addToast(
            t('view_lookup_failed', 'View lookup failed: {{message}}', {
              message: err.message,
            }),
            'error',
          );
        });
    });
  }

  function handleSort(col) {
    if (sort.column === col) {
      setSort({ column: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ column: col, dir: 'asc' });
    }
    setPage(1);
    setSelectedRows(new Set());
  }

  function handleFilterChange(col, val) {
    setFilters((f) => ({ ...f, [col]: val }));
    setPage(1);
    setSelectedRows(new Set());
  }

  async function handleSubmit(values) {
    const columns = new Set(allColumns);
    const merged = { ...(editing || {}) };
    Object.entries(values).forEach(([k, v]) => {
      merged[k] = v;
    });

    Object.entries(formConfig?.defaultValues || {}).forEach(([k, v]) => {
      if (merged[k] === undefined || merged[k] === '') merged[k] = v;
    });

    if (isAdding && autoFillSession) {
      userIdFields.forEach((f) => {
        if (columns.has(f)) merged[f] = user?.empid;
      });
      branchIdFields.forEach((f) => {
        if (columns.has(f) && branch !== undefined) merged[f] = branch;
      });
      departmentIdFields.forEach((f) => {
        if (columns.has(f) && department !== undefined) merged[f] = department;
      });
      companyIdFields.forEach((f) => {
        if (columns.has(f) && company !== undefined) merged[f] = company;
      });
    }

    const baseRowForName = isAdding ? values : editing;
    const { name: oldImageName } = buildImageName(
      baseRowForName || merged,
      formConfig?.imagenameField || [],
      columnCaseMap,
    );

    const required = formConfig?.requiredFields || [];
    for (const f of required) {
      if (merged[f] === undefined || merged[f] === '') {
        addToast(
          t('please_fill_field', 'Please fill {{field}}', {
            field: labels[f] || f,
          }),
          'error',
        );
        return;
      }
    }

    const cleaned = {};
    const skipFields = new Set([...autoCols, ...generatedCols, 'id']);
    Object.entries(merged).forEach(([k, v]) => {
      const lower = k.toLowerCase();
      if (skipFields.has(k) || k.startsWith('_')) return;
      if (auditFieldSet.has(lower) && !(editSet?.has(lower))) return;
      if (v !== '') {
        cleaned[k] =
          typeof v === 'string' ? normalizeDateInput(v, placeholders[k]) : v;
      }
    });

    if (requestType === 'edit') {
      const reason = await promptRequestReason();
      if (!reason || !reason.trim()) {
        addToast(
          t('request_reason_required', 'Request reason is required'),
          'error',
        );
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/pending_request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            table_name: table,
            record_id: getRowId(editing),
            request_type: 'edit',
            request_reason: reason,
            proposed_data: cleaned,
          }),
        });
        if (res.ok) {
          addToast(
            t('edit_request_submitted', 'Edit request submitted'),
            'success',
          );
          setShowForm(false);
          setEditing(null);
          setIsAdding(false);
          setGridRows([]);
          setRequestType(null);
        } else if (res.status === 409) {
          addToast(
            t('similar_request_pending', 'A similar request is already pending'),
            'error',
          );
        } else {
          addToast(t('edit_request_failed', 'Edit request failed'), 'error');
        }
      } catch {
        addToast(t('edit_request_failed', 'Edit request failed'), 'error');
      }
      return;
    }

    const method = isAdding ? 'POST' : 'PUT';
    const url = isAdding
      ? `/api/tables/${encodeURIComponent(table)}`
      : `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(getRowId(editing))}`;

    if (isAdding) {
      if (columns.has('created_by')) cleaned.created_by = user?.empid;
      if (columns.has('created_at')) {
        cleaned.created_at = formatTimestamp(new Date());
      }
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cleaned),
      });
      const savedRow = res.ok ? await res.json().catch(() => ({})) : {};
      if (res.ok) {
        const params = new URLSearchParams({ page, perPage });
        if (company != null && columns.has('company_id'))
          params.set('company_id', company);
        if (sort.column) {
          params.set('sort', sort.column);
          params.set('dir', sort.dir);
        }
        Object.entries(filters).forEach(([k, v]) => {
          if (v) params.set(k, v);
        });
        const data = await fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
          credentials: 'include',
        }).then((r) => r.json());
        const rows = data.rows || [];
        setRows(rows);
        setCount(data.total ?? data.count ?? 0);
        logRowsMemory(rows);
        setSelectedRows(new Set());
        setShowForm(false);
        setEditing(null);
        setIsAdding(false);
        setGridRows([]);
        const msg = isAdding ? 'Шинэ гүйлгээ хадгалагдлаа' : 'Хадгалагдлаа';
        if (isAdding && (formConfig?.imagenameField || []).length) {
          const inserted = rows.find(
            (r) => String(getRowId(r)) === String(savedRow.id),
          );
          const rowForName = inserted || {
            ...merged,
            [formConfig.imageIdField]: savedRow[formConfig.imageIdField],
          };
          const nameFields = Array.from(
            new Set(
              (formConfig?.imagenameField || [])
                .concat(formConfig?.imageIdField || '')
                .filter(Boolean),
            ),
          );
          const { name: newImageName } = buildImageName(
            rowForName,
            nameFields,
            columnCaseMap,
          );
          const folder = getImageFolder(rowForName);
          if (
            oldImageName &&
            newImageName &&
            (oldImageName !== newImageName || folder !== table)
          ) {
            const renameUrl =
              `/api/transaction_images/${table}/${encodeURIComponent(oldImageName)}` +
              `/rename/${encodeURIComponent(newImageName)}?folder=${encodeURIComponent(folder)}`;
            await fetch(renameUrl, { method: 'POST', credentials: 'include' });
            const verifyUrl =
              `/api/transaction_images/${table}/${encodeURIComponent(newImageName)}?folder=${encodeURIComponent(folder)}`;
            const res2 = await fetch(verifyUrl, { credentials: 'include' });
            const imgs = res2.ok ? await res2.json().catch(() => []) : [];
            if (!Array.isArray(imgs) || imgs.length === 0) {
              await fetch(renameUrl, { method: 'POST', credentials: 'include' });
            }
          }
        }
        addToast(msg, 'success');
        if (isAdding) {
          setTimeout(() => openAdd(), 0);
        }
        return true;
      } else {
        let message = 'Хадгалахад алдаа гарлаа';
        try {
          const data = await res.json();
          if (data && data.message) message += `: ${data.message}`;
        } catch {
          // ignore
        }
        addToast(message, 'error');
        return false;
      }
    } catch (err) {
      console.error('Save failed', err);
      return false;
    }
  }

  async function handleSaveTemporary(submission) {
    if (!supportsTemporary) return false;
    if (!submission || typeof submission !== 'object') return false;
    const normalizedValues = submission.values || submission;
    const merged = { ...(editing || {}) };
    Object.entries(normalizedValues).forEach(([k, v]) => {
      merged[k] = v;
    });
    Object.entries(formConfig?.defaultValues || {}).forEach(([k, v]) => {
      if (merged[k] === undefined || merged[k] === '') merged[k] = v;
    });
    if (isAdding && autoFillSession) {
      const columns = new Set(allColumns);
      userIdFields.forEach((f) => {
        if (columns.has(f)) merged[f] = user?.empid;
      });
      branchIdFields.forEach((f) => {
        if (columns.has(f) && branch !== undefined) merged[f] = branch;
      });
      departmentIdFields.forEach((f) => {
        if (columns.has(f) && department !== undefined) merged[f] = department;
      });
      companyIdFields.forEach((f) => {
        if (columns.has(f) && company !== undefined) merged[f] = company;
      });
    }

    const cleaned = {};
    const skipFields = new Set([...autoCols, ...generatedCols, 'id']);
    Object.entries(merged).forEach(([k, v]) => {
      const lower = k.toLowerCase();
      if (skipFields.has(k) || k.startsWith('_')) return;
      if (auditFieldSet.has(lower) && !(editSet?.has(lower))) return;
      if (v !== '') {
        cleaned[k] =
          typeof v === 'string' ? normalizeDateInput(v, placeholders[k]) : v;
      }
    });

    const body = {
      table,
      formName: formName || formConfig?.moduleLabel || null,
      configName: formName || null,
      moduleKey: formConfig?.moduleKey || null,
      payload: {
        values: normalizedValues,
        submittedAt: new Date().toISOString(),
      },
      rawValues: merged,
      cleanedValues: cleaned,
      tenant: {
        company_id: company ?? null,
        branch_id: branch ?? null,
        department_id: department ?? null,
      },
    };

    try {
      const res = await fetch(`${API_BASE}/transaction_temporaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      addToast(t('temporary_saved', 'Saved as temporary draft'), 'success');
      setShowForm(false);
      setEditing(null);
      setIsAdding(false);
      setGridRows([]);
      await refreshTemporarySummary();
      return true;
    } catch (err) {
      console.error('Temporary save failed', err);
      addToast(t('temporary_save_failed', 'Failed to save temporary draft'), 'error');
      return false;
    }
  }

  async function executeDeleteRow(id, cascade) {
    const res = await fetch(
      `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
        cascade ? '?cascade=true' : ''
      }`,
      { method: 'DELETE', credentials: 'include' },
    );
    if (res.ok) {
      const params = new URLSearchParams({ page, perPage });
      if (company != null && validCols.has('company_id'))
        params.set('company_id', company);
      if (sort.column) {
        params.set('sort', sort.column);
        params.set('dir', sort.dir);
      }
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const data = await fetch(
        `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
        { credentials: 'include' },
      ).then((r) => r.json());
      const rows = data.rows || [];
      setRows(rows);
      setCount(data.total ?? data.count ?? 0);
      logRowsMemory(rows);
      setSelectedRows(new Set());
      addToast(t('deleted', 'Deleted'), 'success');
    } else {
      let message = t('delete_failed', 'Delete failed');
      try {
        const data = await res.json();
        if (data && data.message) message += `: ${data.message}`;
      } catch {
        // ignore json errors
      }
      addToast(message, 'error');
    }
  }

  async function handleDelete(row) {
    const id = getRowId(row);
    if (id === undefined) {
      addToast(
        t('delete_failed_no_primary_key', 'Delete failed: table has no primary key'),
        'error',
      );
      return;
    }
    try {
      const refRes = await fetch(
        `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
        { credentials: 'include' }
      );
      if (refRes.ok) {
        const refs = await refRes.json();
        const total = Array.isArray(refs)
          ? refs.reduce((a, r) => a + (r.count || 0), 0)
          : 0;
        if (total > 0) {
          setDeleteInfo({ id, refs });
          setShowCascade(true);
          return;
        }
        if (!window.confirm(t('delete_row_question', 'Delete row?')))
          return;
        await executeDeleteRow(id, false);
        return;
      }
    } catch {
      addToast(
        t('failed_check_references', 'Failed to check references'),
        'error',
      );
    }
    if (
      !window.confirm(
        t('delete_row_related_question', 'Delete row and related records?'),
      )
    )
      return;
    await executeDeleteRow(id, true);
  }

  async function handleRequestDelete(row) {
    const id = getRowId(row);
    if (id === undefined) {
      addToast(
        t('delete_request_failed_no_primary_key', 'Delete request failed: table has no primary key'),
        'error',
      );
      return;
    }
    if (!window.confirm(t('request_delete_question', 'Request delete?'))) return;
    const reason = await promptRequestReason();
    if (!reason || !reason.trim()) {
      addToast(
        t('request_reason_required', 'Request reason is required'),
        'error',
      );
      return;
    }
    try {
      const cleaned = {};
      const skipFields = new Set([...autoCols, ...generatedCols, 'id']);
      Object.entries(row).forEach(([k, v]) => {
        const lower = k.toLowerCase();
        if (skipFields.has(k) || k.startsWith('_')) return;
        if (auditFieldSet.has(lower) && !(editSet?.has(lower))) return;
        if (v !== '') cleaned[k] = v;
      });
      const res = await fetch(`${API_BASE}/pending_request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          table_name: table,
          record_id: id,
          request_type: 'delete',
          request_reason: reason,
          proposed_data: cleaned,
        }),
      });
      if (res.ok)
        addToast(
          t('delete_request_submitted', 'Delete request submitted'),
          'success',
        );
      else if (res.status === 409)
        addToast(
          t('similar_request_pending', 'A similar request is already pending'),
          'error',
        );
      else
        addToast(t('delete_request_failed', 'Delete request failed'), 'error');
    } catch {
      addToast(t('delete_request_failed', 'Delete request failed'), 'error');
    }
  }

  async function confirmCascadeDelete() {
    if (!deleteInfo) return;
    await executeDeleteRow(deleteInfo.id, true);
    setShowCascade(false);
    setDeleteInfo(null);
  }

  async function handleDeleteSelected() {
    if (selectedRows.size === 0) return;
    const cascadeMap = new Map();
    let hasRelated = false;
    for (const id of selectedRows) {
      if (id === undefined) {
        addToast(
          t('delete_failed_no_primary_key', 'Delete failed: table has no primary key'),
          'error',
        );
        return;
      }
      try {
        const refRes = await fetch(
          `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
          { credentials: 'include' }
        );
        if (refRes.ok) {
          const refs = await refRes.json();
          const total = Array.isArray(refs)
            ? refs.reduce((a, r) => a + (r.count || 0), 0)
            : 0;
          cascadeMap.set(id, total > 0);
          if (total > 0) hasRelated = true;
        } else {
          cascadeMap.set(id, true);
          hasRelated = true;
        }
      } catch {
        addToast(
          t('failed_check_references', 'Failed to check references'),
          'error',
        );
        cascadeMap.set(id, true);
        hasRelated = true;
      }
    }

    const count = selectedRows.size;
    const confirmMsg = hasRelated
      ? t(
          'delete_selected_rows_related_question',
          'Delete {{count}} selected rows and related records?',
          { count },
        )
      : t(
          'delete_selected_rows_question',
          'Delete {{count}} selected rows?',
          { count },
        );
    if (!window.confirm(confirmMsg)) return;

    for (const id of selectedRows) {
      const cascade = cascadeMap.get(id);
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
          cascade ? '?cascade=true' : ''
        }`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        let message = t('delete_failed_for', 'Delete failed for {{id}}', { id });
        try {
          const data = await res.json();
          if (data && data.message) message += `: ${data.message}`;
        } catch {
          // ignore json errors
        }
        addToast(message, 'error');
        return;
      }
    }
    const params = new URLSearchParams({ page, perPage });
    if (company != null && validCols.has('company_id'))
      params.set('company_id', company);
    if (sort.column) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const dataRes = await fetch(
      `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
      {
        credentials: 'include',
      },
    );
    let data = { rows: [], count: 0 };
    if (dataRes.ok) {
      try {
        data = await dataRes.json();
      } catch {
        addToast(
          t('failed_parse_table_data', 'Failed to parse table data'),
          'error',
        );
      }
    } else {
      addToast(
        t('failed_load_table_data', 'Failed to load table data'),
        'error',
      );
    }
    const rows = data.rows || [];
    setRows(rows);
    setCount(data.total ?? data.count ?? 0);
    logRowsMemory(rows);
    setSelectedRows(new Set());
    addToast(t('deleted', 'Deleted'), 'success');
  }

  function refreshRows() {
    setLocalRefresh((r) => r + 1);
  }

  const fetchTemporaryList = useCallback(
    async (scopeOverride) => {
      if (!supportsTemporary) return;
      const scope = scopeOverride || temporaryScope;
      const params = new URLSearchParams();
      params.set('scope', scope);
      if (table) params.set('table', table);
      setTemporaryLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/transaction_temporaries?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load temporaries');
        const data = await res.json().catch(() => ({}));
        setTemporaryScope(scope);
        setTemporaryList(Array.isArray(data.rows) ? data.rows : []);
      } catch (err) {
        console.error('Failed to load temporaries', err);
        setTemporaryList([]);
      } finally {
        setTemporaryLoading(false);
      }
    },
    [supportsTemporary, table, temporaryScope],
  );

  async function promoteTemporary(id) {
    if (!supportsTemporary) return;
    if (!window.confirm(t('promote_temporary_confirm', 'Promote temporary record?')))
      return;
    try {
      const res = await fetch(
        `${API_BASE}/transaction_temporaries/${encodeURIComponent(id)}/promote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        },
      );
      if (!res.ok) throw new Error('Failed to promote');
      addToast(t('temporary_promoted', 'Temporary promoted'), 'success');
      await refreshTemporarySummary();
      await fetchTemporaryList(temporaryScope);
      setLocalRefresh((r) => r + 1);
    } catch (err) {
      console.error(err);
      addToast(t('temporary_promote_failed', 'Failed to promote temporary'), 'error');
    }
  }

  async function rejectTemporary(id) {
    if (!supportsTemporary) return;
    const notes = window.prompt(t('temporary_reject_reason', 'Enter rejection notes'));
    if (!notes || !notes.trim()) return;
    try {
      const res = await fetch(
        `${API_BASE}/transaction_temporaries/${encodeURIComponent(id)}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ notes }),
        },
      );
      if (!res.ok) throw new Error('Failed to reject');
      addToast(t('temporary_rejected', 'Temporary rejected'), 'success');
      await refreshTemporarySummary();
      await fetchTemporaryList(temporaryScope);
    } catch (err) {
      console.error(err);
      addToast(t('temporary_reject_failed', 'Failed to reject temporary'), 'error');
    }
  }

  if (!table) return null;

  const allColumns =
    columnMeta.length > 0
      ? columnMeta.map((c) => c.name)
      : rows[0]
      ? Object.keys(rows[0])
      : [];

  const ordered = formConfig?.visibleFields?.length
    ? allColumns.filter((c) => formConfig.visibleFields.includes(c))
    : allColumns;
  const labels = {};
  columnMeta.forEach((c) => {
    labels[c.name] = c.label || c.name;
  });
  const auditFieldSet = useMemo(() => {
    const base = [
      'created_by',
      'created_at',
      'updated_by',
      'updated_at',
      'deleted_by',
      'deleted_at',
      'is_deleted',
    ];
    const set = new Set(base.map((name) => name.toLowerCase()));
    columnMeta.forEach((c) => {
      const name = (c.name || '').toLowerCase();
      if (!name) return;
      const rawType = (
        c.type ||
        c.columnType ||
        c.dataType ||
        c.DATA_TYPE ||
        ''
      ).toLowerCase();
      if (
        /tinyint\(1\)|boolean|bool|bit\(1\)/.test(rawType) &&
        name.includes('deleted')
      ) {
        set.add(name);
      }
    });
    return set;
  }, [columnMeta]);
  const hiddenColumnSet = useMemo(() => {
    const set = new Set(auditFieldSet);
    set.add('password');
    return set;
  }, [auditFieldSet]);
  let columns = ordered.filter((c) => !hiddenColumnSet.has(c.toLowerCase()));
  const provided = Array.isArray(formConfig?.editableFields)
    ? formConfig.editableFields
    : [];
  const defaults = Array.isArray(formConfig?.editableDefaultFields)
    ? formConfig.editableDefaultFields
    : [];
  const editVals = Array.from(new Set([...defaults, ...provided]));
  const editSet =
    editVals.length > 0
      ? new Set(editVals.map((f) => f.toLowerCase()))
      : null;
  const placeholders = useMemo(() => {
    const map = {};
    columnMeta.forEach((c) => {
      const typ = fieldTypeMap[c.name];
      if (typ === 'time') {
        map[c.name] = 'HH:MM:SS';
      } else if (typ === 'date' || typ === 'datetime') {
        map[c.name] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [columnMeta, fieldTypeMap]);

  const relationOpts = {};
  ordered.forEach((c) => {
    if (relations[c] && refData[c]) {
      relationOpts[c] = refData[c];
    }
  });
  const labelMap = {};
  Object.entries(relationOpts).forEach(([col, opts]) => {
    labelMap[col] = {};
    opts.forEach((o) => {
      labelMap[col][o.value] = o.label;
    });
  });


  const columnAlign = useMemo(() => {
    const map = {};
    columns.forEach((c) => {
      const sample = rows.find((r) => r[c] !== null && r[c] !== undefined);
      map[c] = typeof sample?.[c] === 'number' ? 'right' : 'left';
    });
    return map;
  }, [columns, rows]);

  const columnWidths = useMemo(() => {
    const map = {};
    if (rows.length === 0) return map;
    columns.forEach((c) => {
      const avg = getAverageLength(c, rows);
      let w;
      if (avg <= 4) w = ch(Math.max(avg + 1, 5));
      else if (placeholders[c] === 'YYYY-MM-DD') w = ch(12);
      else if (placeholders[c] === 'HH:MM:SS') w = ch(12);
      else if (avg <= 10) w = ch(12);
      else w = ch(20);
      map[c] = Math.min(w, MAX_WIDTH);
    });
    return map;
  }, [columns, rows, placeholders]);

  const autoCols = new Set(autoInc);
  if (columnMeta.length > 0 && autoCols.size === 0) {
    const pk = columnMeta.filter((c) => c.key === 'PRI').map((c) => c.name);
    if (pk.length === 1) autoCols.add(pk[0]);
  }
  if (columnMeta.length === 0 && autoCols.size === 0 && allColumns.includes('id')) {
    autoCols.add('id');
  }
  let formColumns = ordered.filter((c) => {
    if (autoCols.has(c)) return false;
    const lower = c.toLowerCase();
    if (auditFieldSet.has(lower) && !(editSet?.has(lower))) return false;
    return true;
  });

  const lockedDefaults = Object.entries(formConfig?.defaultValues || {})
    .filter(([rawKey, value]) => {
      if (value === undefined || value === '') return false;
      if ((formConfig?.editableDefaultFields || []).includes(rawKey)) return false;

      const canonicalKey = resolveCanonicalKey(rawKey);
      const relationKeyMatches = [rawKey, canonicalKey].filter(Boolean);
      const hasRelationMetadata = relationKeyMatches.some((key) => {
        if (key == null) return false;
        return (
          relationOpts[key] !== undefined ||
          relationConfigs[key] !== undefined ||
          viewSourceMap[key] !== undefined
        );
      });

      return !hasRelationMetadata;
    })
    .map(([k]) => k);

  const headerFields = formConfig?.headerFields || [];

  const mainFields = formConfig?.mainFields || [];

  const footerFields = formConfig?.footerFields || [];

  const sectionFields = new Set([...headerFields, ...mainFields, ...footerFields]);
  sectionFields.forEach((f) => {
    if (!formColumns.includes(f) && allColumns.includes(f)) formColumns.push(f);
  });

  let disabledFields = editSet
    ? formColumns.filter((c) => !editSet.has(c.toLowerCase()))
    : [];
  if (isAdding) {
    disabledFields = Array.from(new Set([...disabledFields, ...lockedDefaults]));
  } else if (editing) {
    disabledFields = Array.from(
      new Set([...disabledFields, ...getKeyFields(), ...lockedDefaults]),
    );
  } else {
    disabledFields = Array.from(new Set([...disabledFields, ...lockedDefaults]));
  }

  const totalAmountSet = useMemo(
    () => new Set(formConfig?.totalAmountFields || []),
    [formConfig],
  );
  const totalCurrencySet = useMemo(
    () => new Set(formConfig?.totalCurrencyFields || []),
    [formConfig],
  );
  const totals = useMemo(() => {
    const sums = {};
    columns.forEach((c) => {
      if (
        totalAmountSet.has(c) ||
        totalCurrencySet.has(c) ||
        c === 'TotalCur' ||
        c === 'TotalAmt'
      ) {
        sums[c] = rows.reduce(
          (sum, r) => sum + Number(String(r[c] ?? 0).replace(',', '.')),
          0,
        );
      }
    });
    return { sums, count: rows.length };
  }, [columns, rows, totalAmountSet, totalCurrencySet]);

  const showTotals = useMemo(
    () =>
      columns.some(
        (c) =>
          totalAmountSet.has(c) ||
          totalCurrencySet.has(c) ||
          c === 'TotalCur' ||
          c === 'TotalAmt',
      ),
    [columns, totalAmountSet, totalCurrencySet],
  );

  const uploadCfg = uploadRow ? getConfigForRow(uploadRow) : {};

  const temporaryBadgeCount = useMemo(() => {
    if (!temporarySummary) return 0;
    if (temporarySummary.reviewPending > 0) return temporarySummary.reviewPending;
    return temporarySummary.createdPending ?? 0;
  }, [temporarySummary]);

  return (
    <div>
      <div
        style={{
          marginBottom: '0.5rem',
          position: 'sticky',
          top: 0,
          background: '#ff9',
          zIndex: 1,
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          textAlign: 'left',
        }}
      >
        {buttonPerms['New transaction'] && (
          <TooltipWrapper title={t('add_row', { ns: 'tooltip', defaultValue: 'Add new row' })}>
            <button onClick={openAdd} style={{ marginRight: '0.5rem' }}>
              {addLabel}
            </button>
          </TooltipWrapper>
        )}
        <TooltipWrapper title={t('select_all', { ns: 'tooltip', defaultValue: 'Select all rows' })}>
          <button onClick={selectCurrentPage} style={{ marginRight: '0.5rem' }}>
            Select All
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('deselect_all', { ns: 'tooltip', defaultValue: 'Clear selected rows' })}>
          <button onClick={deselectAll} style={{ marginRight: '0.5rem' }}>
            Deselect All
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('refresh_table', { ns: 'tooltip', defaultValue: 'Reload data' })}>
          <button onClick={refreshRows} style={{ marginRight: '0.5rem' }}>
            Refresh Table
          </button>
        </TooltipWrapper>
        {supportsTemporary && (
          <TooltipWrapper
            title={t('temporary_queue', {
              ns: 'tooltip',
              defaultValue: 'View temporary submissions',
            })}
          >
            <button
              onClick={() => {
                setShowTemporaryModal(true);
                fetchTemporaryList(
                  temporarySummary?.reviewPending > 0 ? 'review' : 'created',
                );
              }}
              style={{ marginRight: '0.5rem', position: 'relative' }}
            >
              {t('temporaries', 'Temporaries')}
              {temporaryBadgeCount > 0 && (
                <span
                  style={{
                    marginLeft: '0.5rem',
                    background: '#2563eb',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '0 0.5rem',
                    fontSize: '0.75rem',
                  }}
                >
                  {temporaryBadgeCount}
                </span>
              )}
            </button>
          </TooltipWrapper>
        )}
        {selectedRows.size > 0 && buttonPerms['Delete transaction'] && (
          <TooltipWrapper title={t('delete_selected', { ns: 'tooltip', defaultValue: 'Remove selected rows' })}>
            <button onClick={handleDeleteSelected}>Delete Selected</button>
          </TooltipWrapper>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.5rem',
          marginBottom: '0.5rem',
          textAlign: 'left',
        }}
      >
      {formConfig?.dateField?.length > 0 && (
        <div style={{ backgroundColor: '#00e0ff', padding: '0.25rem', textAlign: 'left' }}>
          Date:{' '}
          <select
            value={datePreset}
            onChange={(e) => {
              const val = e.target.value;
              setDatePreset(val);
              const now = new Date();
              const y = now.getFullYear();
              const m = now.getMonth();
              const fmt = (d) => formatTimestamp(d).slice(0, 10);
              if (val === 'custom') {
                setCustomStartDate('');
                setCustomEndDate('');
                setDateFilter('');
                return;
              }
              let start;
              let end;
              switch (val) {
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
                  setDateFilter('');
                  return;
              }
              setDateFilter(`${fmt(start)}-${fmt(end)}`);
              }}
            style={{ marginRight: '0.5rem' }}
          >
            <option value="custom">Custom</option>
            <option value="month">This Month</option>
            <option value="q1">Quarter #1</option>
            <option value="q2">Quarter #2</option>
            <option value="q3">Quarter #3</option>
            <option value="q4">Quarter #4</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          {datePreset === 'custom' && (
            <>
              <CustomDatePicker
                value={customStartDate}
                onChange={(v) =>
                  setCustomStartDate(normalizeDateInput(v, 'YYYY-MM-DD'))
                }
                style={{ marginRight: '0.25rem' }}
              />
              <CustomDatePicker
                value={customEndDate}
                onChange={(v) =>
                  setCustomEndDate(normalizeDateInput(v, 'YYYY-MM-DD'))
                }
                style={{ marginRight: '0.5rem' }}
              />
            </>
          )}
          {buttonPerms['Clear Date Filter'] && (
            <button
              onClick={() => {
                setDateFilter('');
                setDatePreset('custom');
                setCustomStartDate('');
                setCustomEndDate('');
              }}
            >
              Clear Date Filter
            </button>
          )}
        </div>
      )}
      {formConfig?.transactionTypeField && (
        <div style={{ backgroundColor: '#ffd600', padding: '0.25rem', textAlign: 'left' }}>
          Type:{' '}
          {typeOptions.length > 0 ? (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ marginRight: '0.5rem' }}
            >
              <option value="">-- all --</option>
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            ) : (
              <span style={{ marginRight: '0.5rem' }}>{typeFilter || 'All'}</span>
            )}
          {typeFilter && buttonPerms['Clear Transaction Type Filter'] && (
            <button onClick={() => setTypeFilter('')}>
              Clear Transaction Type Filter
            </button>
          )}
        </div>
      )}
      {companyIdFields.length > 0 && company !== undefined && (
        <div style={{ backgroundColor: '#ffddff', padding: '0.25rem', textAlign: 'left' }}>
          Company:{' '}
          <span style={{ marginRight: '0.5rem' }}>{company}</span>
          {buttonPerms['Clear Company Filter'] && (
            <button
              onClick={() =>
                companyIdFields.forEach((f) => handleFilterChange(f, ''))
              }
            >
              Clear Company Filter
            </button>
          )}
        </div>
      )}
      {branchIdFields.length > 0 && branch !== undefined && (
        <div style={{ backgroundColor: '#ddffee', padding: '0.25rem', textAlign: 'left' }}>
          Branch:{' '}
          <span style={{ marginRight: '0.5rem' }}>{branch}</span>
          {buttonPerms['Clear Branch Filter'] && (
            <button
              onClick={() =>
                branchIdFields.forEach((f) => handleFilterChange(f, ''))
              }
            >
              Clear Branch Filter
            </button>
          )}
        </div>
      )}
      {departmentIdFields.length > 0 && department !== undefined && (
        <div style={{ backgroundColor: '#eefcff', padding: '0.25rem', textAlign: 'left' }}>
          Department:{' '}
          <span style={{ marginRight: '0.5rem' }}>{department}</span>
          {buttonPerms['Clear Department Filter'] && (
            <button
              onClick={() =>
                departmentIdFields.forEach((f) => handleFilterChange(f, ''))
              }
            >
              Clear Department Filter
            </button>
          )}
        </div>
      )}
      {canRequestStatus && (
        <div style={{ backgroundColor: '#e0f7ff', padding: '0.25rem', textAlign: 'left' }}>
          Request Status:{' '}
          <select
            value={requestStatus}
            onChange={(e) => setRequestStatus(e.target.value)}
            style={{ marginRight: '0.5rem' }}
          >
            <option value="">-- all --</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </select>
          {requestStatus && (
            <button onClick={() => setRequestStatus('')}>
              Clear Request Status
            </button>
          )}
        </div>
      )}
      {userIdFields.length > 0 && user?.empid !== undefined && (
        <div style={{ backgroundColor: '#ffeecc', padding: '0.25rem', textAlign: 'left' }}>
          User:{' '}
          <span style={{ marginRight: '0.5rem' }}>{user.empid}</span>
          {buttonPerms['Clear User Filter'] && (
            <button
              onClick={() =>
                userIdFields.forEach((f) => handleFilterChange(f, ''))
              }
            >
              Clear User Filter
            </button>
          )}
        </div>
      )}
      </div>
      {showTable && (
        <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginBottom: '0.5rem',
          gap: '1rem',
        }}
      >
        <div>
          Rows per page:
          <input
            type="number"
            value={perPage}
            onChange={(e) => {
              setPage(1);
              setPerPage(Number(e.target.value) || 1);
            }}
            min="1"
            style={{ marginLeft: '0.25rem', width: '4rem' }}
          />
        </div>
        <div>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: '0.25rem' }}>
            {'<<'}
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ marginRight: '0.25rem' }}
          >
            {'<'}
          </button>
          <span>
            Page
            <input
              type="number"
              value={page}
              onChange={(e) => {
                let val = Number(e.target.value) || 1;
                const max = Math.max(1, Math.ceil(count / perPage));
                if (val < 1) val = 1;
                if (val > max) val = max;
                setPage(val);
              }}
              style={{ width: '3rem', margin: '0 0.25rem', textAlign: 'center' }}
              min="1"
              max={Math.max(1, Math.ceil(count / perPage))}
            />
            of {Math.max(1, Math.ceil(count / perPage))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(count / perPage), p + 1))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>'}
          </button>
          <button
            onClick={() => setPage(Math.ceil(count / perPage))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>>'}
          </button>
        </div>
      </div>
      <div className="table-container overflow-x-auto">
      <table
        style={{
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          minWidth: '1200px',
          maxWidth: '2000px',
        }}
      >
        <thead className="sticky-header">
          <tr style={{ backgroundColor: '#e5e7eb' }}>
            <th style={{ padding: '0.5rem', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: 60, textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={
                  rows.length > 0 &&
                  rows.every((r) => {
                    const rid = getRowId(r);
                    return rid !== undefined && selectedRows.has(rid);
                  })
                }
                onChange={(e) => (e.target.checked ? selectCurrentPage() : deselectAll())}
              />
            </th>
            {columns.map((c) => (
              <th
                key={c}
                onClick={() => handleSort(c)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  lineHeight: 1.2,
                  fontSize: '0.75rem',
                  textAlign: columnAlign[c],
                  width: columnWidths[c],
                  minWidth: columnWidths[c],
                  maxWidth: MAX_WIDTH,
                  resize: 'horizontal',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'pointer',
                  ...(columnWidths[c] <= ch(8)
                    ? {
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                        overflowWrap: 'break-word',
                        maxHeight: '15ch',
                      }
                    : {}),
                }}
              >
                <TooltipWrapper
                  title={t(c.toLowerCase(), {
                    ns: 'tooltip',
                    defaultValue: labels[c] || c,
                  })}
                >
                  {labels[c] || c}
                </TooltipWrapper>
                {sort.column === c ? (sort.dir === 'asc' ? ' \u2191' : ' \u2193') : ''}
              </th>
            ))}
            <th style={{ padding: '0.5rem', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: 180 }}>Action</th>
          </tr>
          <tr>
            <th style={{ padding: '0.25rem', border: '1px solid #d1d5db', width: 60 }}></th>
            {columns.map((c) => (
            <th
              key={c}
              style={{
                padding: '0.25rem',
                border: '1px solid #d1d5db',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                fontSize: '0.75rem',
                textAlign: columnAlign[c],
                width: columnWidths[c],
                minWidth: columnWidths[c],
                maxWidth: MAX_WIDTH,
                resize: 'horizontal',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
                {Array.isArray(relationOpts[c]) ? (
                  <select
                    value={filters[c] || ''}
                    onChange={(e) => handleFilterChange(c, e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value=""></option>
                    {relationOpts[c].map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={filters[c] || ''}
                    onChange={(e) => handleFilterChange(c, e.target.value)}
                    style={{ width: '100%' }}
                  />
                )}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '0.5rem' }}>
                No data.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const rid = getRowId(r);
            const ridKey =
              rid === undefined || rid === null ? null : String(rid);
            const lockInfo = ridKey ? lockMetadataById[ridKey] : null;
            const locked = Boolean(r?.locked);
            const lockCreatedAt =
              formatMetaDate(
                coalesce(lockInfo, 'created_at', 'createdAt', 'locked_at', 'lockedAt') ||
                  coalesce(r, 'locked_at'),
              ) || null;
            const lockApprovedAt =
              formatMetaDate(
                coalesce(lockInfo, 'approved_at', 'approvedAt', 'activated_at', 'activatedAt'),
              ) || null;
            const lockedBy =
              coalesce(
                lockInfo,
                'locked_by_name',
                'locked_by',
                'created_by_name',
                'created_by',
              ) ||
              coalesce(r, 'locked_by_name', 'locked_by');
            const approvedBy =
              coalesce(lockInfo, 'approved_by_name', 'approved_by', 'activated_by_name', 'activated_by');
            const requestInfo =
              coalesce(lockInfo, 'request', 'latest_request') ||
              (locked ? lockInfo : null);
            const requestStatusRaw = (
              coalesce(requestInfo, 'status', 'request_status') ||
              coalesce(lockInfo, 'request_status') ||
              coalesce(r, 'request_status') ||
              ''
            )
              .toString()
              .trim()
              .toLowerCase();
            const requestStatusLabel = requestStatusLabels[requestStatusRaw] || '';
            const requestStatusColor = requestStatusColors[requestStatusRaw];
            const requestReason =
              coalesce(requestInfo, 'request_reason', 'reason') ||
              coalesce(lockInfo, 'request_reason');
            const approvalLinkRaw =
              coalesce(
                lockInfo,
                'approval_url',
                'report_url',
                'request_url',
                'context_url',
                'link',
              ) ||
              '';
            const approvalRequestId = coalesce(lockInfo, 'request_id', 'requestId');
            const approvalLink = approvalLinkRaw
              ? approvalLinkRaw
              : approvalRequestId
              ? `#/erp/requests?requestId=${approvalRequestId}`
              : '';
            const tooltipParts = [];
            if (lockedBy) tooltipParts.push(`Locked by: ${lockedBy}`);
            if (lockCreatedAt) tooltipParts.push(`Locked at: ${lockCreatedAt}`);
            if (approvedBy) tooltipParts.push(`Approved by: ${approvedBy}`);
            if (lockApprovedAt) tooltipParts.push(`Approved at: ${lockApprovedAt}`);
            if (requestStatusLabel)
              tooltipParts.push(`Request status: ${requestStatusLabel}`);
            if (requestReason)
              tooltipParts.push(`Reason: ${String(requestReason).substring(0, 200)}`);
            const lockTooltip = tooltipParts.join('\n');
            return (
              <tr
                key={r.id || JSON.stringify(r)}
                onClick={(e) => {
                  const t = e.target.tagName;
                  if (t !== 'INPUT' && t !== 'BUTTON' && t !== 'SELECT' && t !== 'A') {
                    openDetail(r);
                  }
                }}
                style={{
                  cursor: 'pointer',
                  ...(requestStatusColors[requestStatus]
                    ? { backgroundColor: requestStatusColors[requestStatus] }
                    : {}),
                }}
              >
                <td
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    width: 60,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    {locked && (
                      <TooltipWrapper title={lockTooltip || 'Locked'}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            backgroundColor: '#1f2937',
                            color: 'white',
                            borderRadius: '9999px',
                            fontSize: '0.65rem',
                            padding: '0.15rem 0.5rem',
                          }}
                        >
                          🔒 Locked
                        </span>
                      </TooltipWrapper>
                    )}
                    <input
                      type="checkbox"
                      disabled={rid === undefined}
                      checked={rid !== undefined && selectedRows.has(rid)}
                      onChange={() => rid !== undefined && toggleRow(rid)}
                    />
                  </div>
                </td>
              {columns.map((c) => {
                const w = columnWidths[c];
                const style = {
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  textAlign: columnAlign[c],
                };
                if (w) {
                  style.width = w;
                  style.minWidth = w;
                  style.maxWidth = MAX_WIDTH;
                  if (w <= 120) {
                    style.whiteSpace = 'nowrap';
                  } else {
                    style.whiteSpace = 'nowrap';
                    style.overflowX = 'auto';
                  }
                }
                style.overflow = 'hidden';
                style.textOverflow = 'ellipsis';
                const raw = relationOpts[c]
                  ? labelMap[c][r[c]] || String(r[c])
                  : String(r[c]);
                let display = raw;
                if (c === 'TotalCur' || totalCurrencySet.has(c)) {
                  display = currencyFmt.format(Number(r[c] || 0));
                } else if (
                  fieldTypeMap[c] === 'date' ||
                  fieldTypeMap[c] === 'datetime' ||
                  fieldTypeMap[c] === 'time'
                ) {
                  display = normalizeDateInput(raw, placeholders[c]);
                } else if (
                  placeholders[c] === undefined &&
                  /^\d{4}-\d{2}-\d{2}T/.test(raw)
                ) {
                  display = normalizeDateInput(raw, 'YYYY-MM-DD');
                }
                const showFull = display.length > 20;
                return (
                  <td
                    key={c}
                    style={style}
                    title={raw}
                    onContextMenu={(e) => raw && openContextMenu(e, sanitizeName(raw))}
                  >
                    {display}
                  </td>
                );
              })}
                <td style={actionCellStyle}>
                  {(() => {
                    const actionButtons = [];
                    actionButtons.push(
                      <button
                        key="view"
                        onClick={() => openDetail(r)}
                        style={actionBtnStyle}
                      >
                        👁 View
                      </button>,
                    );
                    actionButtons.push(
                      <button
                        key="images"
                        onClick={() => openImages(r)}
                        style={actionBtnStyle}
                      >
                        🖼 Images
                      </button>,
                    );
                    actionButtons.push(
                      <button
                        key="upload"
                        onClick={() => openUpload(r)}
                        style={actionBtnStyle}
                      >
                        ➕ Add Img
                      </button>,
                    );
                    const actionLocked = locked;
                    if (!isSubordinate && !actionLocked) {
                      if (buttonPerms['Edit transaction']) {
                        actionButtons.push(
                          <button
                            key="edit"
                            onClick={() => openEdit(r)}
                            disabled={rid === undefined}
                            style={actionBtnStyle}
                          >
                            🖉 Edit
                          </button>,
                        );
                      }
                      if (buttonPerms['Delete transaction']) {
                        actionButtons.push(
                          <button
                            key="delete"
                            onClick={() => handleDelete(r)}
                            disabled={rid === undefined}
                            style={deleteBtnStyle}
                          >
                            ❌ Delete
                          </button>,
                        );
                      }
                    } else {
                      actionButtons.push(
                        <button
                          key="request-edit"
                          onClick={() => openRequestEdit(r)}
                          disabled={rid === undefined}
                          style={actionBtnStyle}
                        >
                          📝 Request Edit
                        </button>,
                      );
                      actionButtons.push(
                        <button
                          key="request-delete"
                          onClick={() => handleRequestDelete(r)}
                          disabled={rid === undefined}
                          style={actionBtnStyle}
                        >
                          🗑 Request Delete
                        </button>,
                      );
                    }
                    const requestMeta = [];
                    if (locked && lockedBy) {
                      requestMeta.push(
                        <div
                          key="locked-by"
                          style={{
                            display: 'flex',
                            gap: '0.25rem',
                            justifyContent: 'flex-end',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            color: '#374151',
                          }}
                        >
                          <TooltipWrapper title={lockTooltip || 'Locked'}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                backgroundColor: '#1f2937',
                                color: 'white',
                                borderRadius: '9999px',
                                fontSize: '0.65rem',
                                padding: '0.15rem 0.5rem',
                              }}
                            >
                              🔒 Locked
                            </span>
                          </TooltipWrapper>
                          <span style={{ fontSize: '0.7rem' }}>by {lockedBy}</span>
                        </div>,
                      );
                    }
                    if (requestStatusLabel) {
                      requestMeta.push(
                        <div
                          key="request-status"
                          style={{
                            display: 'flex',
                            gap: '0.25rem',
                            justifyContent: 'flex-end',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            fontSize: '0.7rem',
                            color: '#374151',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: '9999px',
                              padding: '0.15rem 0.6rem',
                              backgroundColor: requestStatusColor || '#e5e7eb',
                              fontWeight: 600,
                            }}
                          >
                            {requestStatusLabel}
                          </span>
                          {requestReason && (
                            <TooltipWrapper title={String(requestReason)}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  width: '1rem',
                                  height: '1rem',
                                  borderRadius: '9999px',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  backgroundColor: '#f3f4f6',
                                  fontSize: '0.65rem',
                                  color: '#111827',
                                }}
                              >
                                i
                              </span>
                            </TooltipWrapper>
                          )}
                          {approvalLink && (
                            <a
                              href={approvalLink}
                              style={{
                                color: '#2563eb',
                                textDecoration: 'underline',
                              }}
                              onClick={(event) => event.stopPropagation()}
                            >
                              View approval
                            </a>
                          )}
                        </div>,
                      );
                    }
                    return (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          gap: '0.35rem',
                          width: '100%',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'flex-end',
                            gap: '0.25rem',
                          }}
                        >
                          {actionButtons}
                        </div>
                        {requestMeta.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.2rem',
                              width: '100%',
                            }}
                          >
                            {requestMeta}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            );
          })}
      </tbody>
      {showTotals && (
        <tfoot>
          <tr>
            <td
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              НИЙТ
            </td>
            {columns.map((c) => {
              let val = '';
              if (c === 'TotalCur') val = currencyFmt.format(totals.sums[c] || 0);
              else if (totalCurrencySet.has(c))
                val = currencyFmt.format(totals.sums[c] || 0);
              else if (totals.sums[c] !== undefined) val = totals.sums[c];
              return (
                <td
                  key={c}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    textAlign: columnAlign[c],
                    fontWeight: 'bold',
                  }}
                >
                  {val}
                </td>
              );
            })}
            <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}></td>
          </tr>
          <tr>
            <td
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              мөрийн тоо
            </td>
            {columns.length > 0 && (
              <td
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  textAlign: columnAlign[columns[0]],
                  fontWeight: 'bold',
                }}
              >
                {totals.count}
              </td>
            )}
            {columns.slice(1).map((c) => (
              <td
                key={c}
                style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}
              ></td>
            ))}
            <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}></td>
          </tr>
        </tfoot>
      )}
      </table>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginTop: '0.5rem',
          gap: '1rem',
        }}
      >
        <div>
          Rows per page:
          <input
            type="number"
            value={perPage}
            onChange={(e) => {
              setPage(1);
              setPerPage(Number(e.target.value) || 1);
            }}
            min="1"
            style={{ marginLeft: '0.25rem', width: '4rem' }}
          />
        </div>
        <div>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: '0.25rem' }}>
            {'<<'}
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ marginRight: '0.25rem' }}
          >
            {'<'}
          </button>
          <span>
            Page
            <input
              type="number"
              value={page}
              onChange={(e) => {
                let val = Number(e.target.value) || 1;
                const max = Math.max(1, Math.ceil(count / perPage));
                if (val < 1) val = 1;
                if (val > max) val = max;
                setPage(val);
              }}
              style={{ width: '3rem', margin: '0 0.25rem', textAlign: 'center' }}
              min="1"
              max={Math.max(1, Math.ceil(count / perPage))}
            />
            of {Math.max(1, Math.ceil(count / perPage))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(count / perPage), p + 1))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>'}
          </button>
          <button
            onClick={() => setPage(Math.ceil(count / perPage))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>>'}
          </button>
        </div>
      </div>
        </>
      )}
      <RowFormModal
        key={`rowform-${table}`}
        visible={showForm}
        useGrid
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
          setIsAdding(false);
          setGridRows([]);
          setRequestType(null);
        }}
        onSubmit={handleSubmit}
        onSaveTemporary={supportsTemporary ? handleSaveTemporary : null}
        onChange={handleFieldChange}
        columns={formColumns}
        row={editing}
        rows={gridRows}
        relations={relationOpts}
        relationConfigs={relationConfigs}
        relationData={refRows}
        fieldTypeMap={fieldTypeMap}
        disabledFields={disabledFields}
        labels={labels}
        requiredFields={formConfig?.requiredFields || []}
        defaultValues={rowDefaults}
        dateField={formConfig?.dateField || []}
        headerFields={headerFields}
        mainFields={mainFields}
        footerFields={footerFields}
        userIdFields={userIdFields}
        branchIdFields={branchIdFields}
        departmentIdFields={departmentIdFields}
        companyIdFields={companyIdFields}
        printEmpField={formConfig?.printEmpField || []}
        printCustField={formConfig?.printCustField || []}
        totalAmountFields={formConfig?.totalAmountFields || []}
        totalCurrencyFields={formConfig?.totalCurrencyFields || []}
        procTriggers={procTriggers}
        columnCaseMap={columnCaseMap}
        table={table}
        tableColumns={columnMeta}
        imagenameField={formConfig?.imagenameField || []}
        imageIdField={formConfig?.imageIdField || ''}
        viewSource={viewSourceMap}
        viewDisplays={viewDisplayMap}
        viewColumns={viewColumns}
        onRowsChange={handleRowsChange}
        autoFillSession={autoFillSession}
        scope="forms"
        allowTemporarySave={supportsTemporary}
        isAdding={isAdding}
      />
      <CascadeDeleteModal
        visible={showCascade}
        references={deleteInfo?.refs || []}
        onCancel={() => {
          setShowCascade(false);
          setDeleteInfo(null);
        }}
        onConfirm={confirmCascadeDelete}
      />
      <RowDetailModal
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        row={detailRow}
        columns={columns}
        relations={relationOpts}
        references={detailRefs}
        labels={labels}
        fieldTypeMap={fieldTypeMap}
      />
      <RowImageUploadModal
        visible={uploadRow !== null}
        onClose={() => setUploadRow(null)}
        table={table}
        folder={getImageFolder(uploadRow)}
        row={uploadRow || {}}
        rowKey={0}
        imagenameFields={uploadCfg.imagenameField || []}
        columnCaseMap={columnCaseMap}
        imageIdField={uploadCfg.imageIdField || ''}
        onUploaded={(name) => {
          if (uploadRow) {
            const id = getRowId(uploadRow);
            setRows((rs) =>
              rs.map((r) =>
                getRowId(r) === id ? { ...r, _imageName: name } : r,
              ),
            );
          }
        }}
      />
      <RowImageViewModal
        visible={imagesRow !== null}
        onClose={() => setImagesRow(null)}
        table={table}
        folder={getImageFolder(imagesRow)}
        row={imagesRow || {}}
        columnCaseMap={columnCaseMap}
        configs={allConfigs}
      />
      <Modal
        visible={showTemporaryModal}
        onClose={() => setShowTemporaryModal(false)}
        title={t('temporary_modal_title', 'Temporary submissions')}
        width="70vw"
      >
        {!supportsTemporary && (
          <p>{t('temporary_not_supported', 'Temporary submissions are not available for this form.')}</p>
        )}
        {supportsTemporary && (
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <button
                type="button"
                onClick={() => fetchTemporaryList('created')}
                disabled={temporaryScope === 'created'}
                style={{
                  padding: '0.35rem 0.75rem',
                  backgroundColor: temporaryScope === 'created' ? '#2563eb' : '#e5e7eb',
                  color: temporaryScope === 'created' ? '#fff' : '#111827',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: temporaryScope === 'created' ? 'default' : 'pointer',
                }}
              >
                {t('temporary_my_drafts', 'My drafts')}
                {temporarySummary?.createdPending
                  ? ` (${temporarySummary.createdPending})`
                  : ''}
              </button>
              <button
                type="button"
                onClick={() => fetchTemporaryList('review')}
                disabled={temporaryScope === 'review'}
                style={{
                  padding: '0.35rem 0.75rem',
                  backgroundColor: temporaryScope === 'review' ? '#2563eb' : '#e5e7eb',
                  color: temporaryScope === 'review' ? '#fff' : '#111827',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: temporaryScope === 'review' ? 'default' : 'pointer',
                }}
              >
                {t('temporary_review_queue', 'Review queue')}
                {temporarySummary?.reviewPending
                  ? ` (${temporarySummary.reviewPending})`
                  : ''}
              </button>
            </div>
            {temporaryLoading ? (
              <p>{t('loading', 'Loading')}...</p>
            ) : temporaryList.length === 0 ? (
              <p>{t('temporary_empty', 'No temporary submissions found.')}</p>
            ) : (
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>#</th>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>{t('table', 'Table')}</th>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>{t('created_by', 'Created by')}</th>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>{t('status', 'Status')}</th>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>{t('created_at', 'Created at')}</th>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>{t('details', 'Details')}</th>
                      {temporaryScope === 'review' && (
                        <th
                          style={{
                            borderBottom: '1px solid #d1d5db',
                            textAlign: 'right',
                            padding: '0.25rem',
                          }}
                        >
                          {t('actions', 'Actions')}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {temporaryList.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>{entry.id}</td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>
                          <div style={{ fontWeight: 600 }}>{entry.formName || '-'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#4b5563' }}>{entry.tableName}</div>
                        </td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>{entry.createdBy}</td>
                        <td
                          style={{
                            borderBottom: '1px solid #f3f4f6',
                            padding: '0.25rem',
                            textTransform: 'capitalize',
                          }}
                        >
                          {entry.status}
                        </td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>
                          {formatTimestamp(entry.createdAt)}
                        </td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>
                          <pre
                            style={{
                              background: '#f9fafb',
                              padding: '0.5rem',
                              borderRadius: '4px',
                              maxHeight: '12rem',
                              overflow: 'auto',
                              fontSize: '0.75rem',
                            }}
                          >
                            {JSON.stringify(
                              entry.cleanedValues || entry.payload?.values || {},
                              null,
                              2,
                            )}
                          </pre>
                        </td>
                        {temporaryScope === 'review' && (
                          <td
                            style={{
                              borderBottom: '1px solid #f3f4f6',
                              padding: '0.25rem',
                              textAlign: 'right',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {entry.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => promoteTemporary(entry.id)}
                                  style={{
                                    marginRight: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#16a34a',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                  }}
                                >
                                  {t('promote', 'Promote')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectTemporary(entry.id)}
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#dc2626',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                  }}
                                >
                                  {t('reject', 'Reject')}
                                </button>
                              </>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                                {entry.status === 'promoted'
                                  ? t('temporary_promoted_short', 'Promoted')
                                  : t('temporary_rejected_short', 'Rejected')}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
      <ImageSearchModal
        visible={showSearch}
        term={searchTerm}
        images={searchImages}
        page={searchPage}
        total={searchTotal}
        perPage={20}
        onClose={() => setShowSearch(false)}
        onPrev={() => loadSearch(searchTerm, searchPage - 1)}
        onNext={() => loadSearch(searchTerm, searchPage + 1)}
      />
      {ctxMenu && (
        <ul
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            background: '#fff',
            border: '1px solid #ccc',
            listStyle: 'none',
            margin: 0,
            padding: '0.25rem 0',
            zIndex: 1000,
          }}
        >
          <li
            style={{ padding: '0.25rem 1rem', cursor: 'pointer' }}
            onClick={() => {
              loadSearch(ctxMenu.value);
              setCtxMenu(null);
            }}
          >
            Search images
          </li>
        </ul>
      )}
      {buttonPerms['Edit Field Labels'] && generalConfig.general?.editLabelsEnabled && (
        <button onClick={() => {
          const map = {};
          columnMeta.forEach((c) => { map[c.name] = c.label || ''; });
          setLabelEdits(map);
          setEditLabels(true);
        }} style={{ marginTop: '0.5rem' }}>
          Edit Field Labels
        </button>
      )}
      {editLabels && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '4px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Edit Labels</h3>
            {columns.map((c) => (
              <div key={c} style={{ marginBottom: '0.5rem' }}>
                {c}:{' '}
                <input value={labelEdits[c] || ''} onChange={(e) => setLabelEdits({ ...labelEdits, [c]: e.target.value })} />
              </div>
            ))}
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setEditLabels(false)} style={{ marginRight: '0.5rem' }}>Cancel</button>
              <button onClick={async () => {
                await fetch('/api/header_mappings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ mappings: labelEdits }),
                });
                const res = await fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' });
                if (res.ok) {
                  const cols = await res.json();
                  setColumnMeta(cols);
                }
                setEditLabels(false);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
      <Modal
        visible={showReasonModal}
        title="Request Reason"
        onClose={cancelRequestReason}
        width="400px"
      >
        <textarea
          value={requestReason}
          onChange={(e) => setRequestReason(e.target.value)}
          style={{ width: '100%', minHeight: '6em' }}
        />
        <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
          <button onClick={cancelRequestReason} style={{ marginRight: '0.5rem' }}>
            Cancel
          </button>
          <button onClick={submitRequestReason}>Submit</button>
        </div>
      </Modal>
    </div>
  );
});

function propsEqual(prev, next) {
  return (
    prev.table === next.table &&
    prev.refreshId === next.refreshId &&
    prev.formConfig === next.formConfig &&
    prev.allConfigs === next.allConfigs &&
    prev.showTable === next.showTable &&
    prev.buttonPerms === next.buttonPerms
  );
}

export default memo(TableManager, propsEqual);

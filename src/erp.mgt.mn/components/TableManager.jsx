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
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
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
import resolveImageNames from '../utils/resolveImageNames.js';
import slugify from '../utils/slugify.js';
import { getTenantKeyList } from '../utils/tenantKeys.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';
import { useTranslation } from 'react-i18next';
import TooltipWrapper from './TooltipWrapper.jsx';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import normalizeDateInput from '../utils/normalizeDateInput.js';
import { evaluateTransactionFormAccess } from '../utils/transactionFormAccess.js';
import {
  applyGeneratedColumnEvaluators,
  createGeneratedColumnEvaluator,
  valuesEqual,
} from '../utils/generatedColumns.js';
import { isPlainRecord } from '../utils/transactionValues.js';
import { extractRowIndex, sortRowsByIndex } from '../utils/sortRowsByIndex.js';
import { resolveDisabledFieldState } from './tableManagerDisabledFields.js';
import { computeTemporaryPromotionOptions } from '../utils/temporaryPromotionOptions.js';
import NotificationDots from './NotificationDots.jsx';
import safeRequest from '../utils/safeRequest.js';
import {
  formatJsonItem,
  formatJsonList,
  formatJsonListLines,
} from '../utils/jsonValueFormatting.js';
import normalizeRelationKey from '../utils/normalizeRelationKey.js';
import getRelationRowFromMap from '../utils/getRelationRowFromMap.js';

const TEMPORARY_FILTER_CACHE_KEY = 'temporary-transaction-filter';

function cacheTemporaryFilter(field, value) {
  if (typeof window === 'undefined') return;
  try {
    if (field && value !== undefined && value !== null && `${value}`.trim() !== '') {
      const payload = { field: String(field), value };
      window.localStorage.setItem(TEMPORARY_FILTER_CACHE_KEY, JSON.stringify(payload));
    } else {
      window.localStorage.removeItem(TEMPORARY_FILTER_CACHE_KEY);
    }
  } catch (err) {
    console.error('Failed to cache temporary transaction filter', err);
  }
}

if (typeof window !== 'undefined' && typeof window.canPostTransactions === 'undefined') {
  window.canPostTransactions = false;
}

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

function normalizeSearchValue(value) {
  if (value && typeof value === 'object') {
    if (value.value !== undefined && value.value !== null) return value.value;
    if (value.id !== undefined && value.id !== null) return value.id;
    if (value.Id !== undefined && value.Id !== null) return value.Id;
    if (value.label !== undefined && value.label !== null) return value.label;
  }
  return value;
}

function addRelationRowEntry(map, key, row) {
  if (!map || key === undefined || key === null) return;
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = row;
  }
  const stringKey = typeof key === 'string' ? key : String(key);
  if (!Object.prototype.hasOwnProperty.call(map, stringKey)) {
    map[stringKey] = row;
  }
  const normalizedKey = normalizeRelationKey(key);
  if (
    normalizedKey !== null &&
    normalizedKey !== undefined &&
    !Object.prototype.hasOwnProperty.call(map, normalizedKey)
  ) {
    map[normalizedKey] = row;
  }
}

function sanitizeName(name) {
  return String(normalizeSearchValue(name))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, '_');
}

function buildDelimitedSearchTerm(value, delimiter = '_') {
  if (value === undefined || value === null) return '';
  const safe = sanitizeName(normalizeSearchValue(value));
  if (!safe) return '';
  return `${delimiter}${safe}${delimiter}`;
}

function getRowValueCaseInsensitive(row, key) {
  if (!row || key === undefined || key === null) return undefined;
  const keyMap = {};
  Object.keys(row || {}).forEach((k) => {
    keyMap[k.toLowerCase()] = k;
  });
  const lookup = keyMap[String(key).toLowerCase()];
  if (lookup) return row[lookup];
  return row[key];
}

function getRelationSearchValue(row, columnName, relationInfo) {
  if (!row || !relationInfo || !relationInfo.config) return undefined;
  const candidates = new Set();
  if (relationInfo.sourceColumn) candidates.add(relationInfo.sourceColumn);
  if (columnName) candidates.add(columnName);
  if (relationInfo.config.idField) candidates.add(relationInfo.config.idField);
  if (relationInfo.config.column) candidates.add(relationInfo.config.column);
  for (const field of candidates) {
    const val = normalizeSearchValue(getRowValueCaseInsensitive(row, field));
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return undefined;
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

function resolveScopeId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    if (value.id !== undefined && value.id !== null) return value.id;
    if (value.branch_id !== undefined && value.branch_id !== null)
      return value.branch_id;
    if (value.department_id !== undefined && value.department_id !== null)
      return value.department_id;
    if (value.key !== undefined && value.key !== null) return value.key;
    if (value.code !== undefined && value.code !== null) return value.code;
    if (value.value !== undefined && value.value !== null) return value.value;
  }
  return value;
}

const LABEL_WRAPPER_KEYS = new Set([
  'value',
  'label',
  'name',
  'title',
  'text',
  'display',
  'displayName',
  'code',
]);

function stripTemporaryLabelValue(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const mapped = value.map((item) => {
      const next = stripTemporaryLabelValue(item);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? mapped : value;
  }
  if (value instanceof Date) return value;
  if (typeof File !== 'undefined' && value instanceof File) return value;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
  if (typeof value !== 'object') return value;

  if (Object.prototype.hasOwnProperty.call(value, 'value')) {
    const keys = Object.keys(value);
    const onlyKnownKeys = keys.every((key) => LABEL_WRAPPER_KEYS.has(key));
    if (onlyKnownKeys) {
      return stripTemporaryLabelValue(value.value);
    }
  }

  let changed = false;
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    const next = stripTemporaryLabelValue(val);
    if (next !== val) changed = true;
    result[key] = next;
  }
  return changed ? result : value;
}

const DEFAULT_EDITABLE_NESTED_KEYS = [
  'fields',
  'fieldList',
  'fieldSet',
  'list',
  'values',
  'columns',
  'items',
  'editableFields',
  'editableDefaultFields',
  'allowedFields',
  'permittedFields',
];

function walkEditableFieldValues(source, callback, options = {}) {
  if (typeof callback !== 'function') return;

  const skipKeys = new Set([
    'hasExplicitConfig',
    '__proto__',
    ...(Array.isArray(options.skipKeys) ? options.skipKeys : []),
  ]);
  const nestedKeySet = new Set(
    Array.isArray(options.nestedKeys)
      ? options.nestedKeys
      : DEFAULT_EDITABLE_NESTED_KEYS,
  );
  const visited = new Set();

  const visit = (value) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const raw = String(value).trim();
      if (!raw) return;
      callback(raw);
      return;
    }
    if (value instanceof Set) {
      value.forEach(visit);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value instanceof Map) {
      value.forEach((enabled, key) => {
        if (!enabled) return;
        visit(key);
      });
      return;
    }
    if (!isPlainRecord(value)) return;
    if (visited.has(value)) return;
    visited.add(value);

    nestedKeySet.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        visit(value[key]);
      }
    });

    Object.entries(value).forEach(([key, val]) => {
      if (skipKeys.has(key) || nestedKeySet.has(key)) return;
      if (val === undefined || val === null) return;
      if (typeof val === 'boolean') {
        if (val) visit(key);
        return;
      }
      if (typeof val === 'number' || typeof val === 'string') {
        visit(val);
        return;
      }
      visit(val);
    });
  };

  visit(source);
}

function getTemporaryId(entry) {
  if (!entry || entry.id === undefined || entry.id === null) return null;
  return String(entry.id);
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

function isValidDateFilterValue(filter) {
  if (filter === undefined || filter === null) return true;
  const trimmed = String(filter).trim();
  if (!trimmed) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return true;
  return /^(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/.test(trimmed);
}

const actionCellStyle = {
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  whiteSpace: 'nowrap',
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  alignItems: 'center',
  columnGap: '0.25rem',
  rowGap: '0.25rem',
};
const actionBtnStyle = {
  background: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  fontSize: '0.75rem',
  padding: '0.25rem 0.4rem',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.25rem',
  lineHeight: 1,
  whiteSpace: 'nowrap',
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

const ACTIVE_LOCK_STATUSES = new Set([
  'pending',
  'locked',
  'approved',
  'accepted',
  'active',
  'activated',
]);

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

function normalizeLockStatus(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function normalizeWorkflowStatus(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function isTruthyFlag(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  if (['false', '0', 'no', 'off', 'inactive', 'disabled'].includes(normalized)) {
    return false;
  }
  return true;
}

function rowHasActiveLock(row, metadataOverride = null) {
  if (!row && !metadataOverride) return false;
  const metadata =
    metadataOverride ?? coalesce(row, 'lockMetadata', 'lock_metadata');
  const requestInfo = coalesce(metadata, 'request', 'latest_request');
  const requestId =
    coalesce(metadata, 'request_id', 'requestId') ??
    coalesce(requestInfo, 'request_id', 'requestId', 'id') ??
    coalesce(row, 'request_id', 'requestId');
  const requestStatus = normalizeLockStatus(
    coalesce(metadata, 'request_status', 'requestStatus') ??
      coalesce(row, 'request_status', 'requestStatus'),
  );
  const hasRequestContext = Boolean(requestId || requestStatus);
  const statusCandidates = [
    metadata?.status,
    metadata?.lock_status,
    coalesce(row, 'lockStatus', 'lock_status', 'requestStatus', 'request_status'),
  ];
  for (const candidate of statusCandidates) {
    const normalized = normalizeLockStatus(candidate);
    if (!normalized || !ACTIVE_LOCK_STATUSES.has(normalized)) {
      continue;
    }
    if (normalized === 'pending' && !hasRequestContext) {
      continue;
    }
    return true;
  }
  return Boolean(row?.locked);
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
  externalTemporaryTrigger = null,
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
  const [jsonRelationLabels, setJsonRelationLabels] = useState({});
  const jsonRelationFetchCache = useRef({});
  const relationValueSnapshotRef = useRef({});
  const hiddenRelationFetchCacheRef = useRef({ table: null, fields: new Set() });
  const displayFieldConfigCache = useRef(new Map());
  const [columnMeta, setColumnMeta] = useState([]);
  const [autoInc, setAutoInc] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const showFormRef = useRef(false);
  const [editing, setEditing] = useState(null);
  const [rowDefaults, setRowDefaults] = useState({});
  const [pendingTemporaryPromotion, setPendingTemporaryPromotion] = useState(null);
  const [temporaryPromotionQueue, setTemporaryPromotionQueue] = useState([]);
  const [forceResolvePendingDrafts, setForceResolvePendingDrafts] = useState(false);
  const [activeTemporaryDraftId, setActiveTemporaryDraftId] = useState(null);
  const [gridRows, setGridRows] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printEmpSelected, setPrintEmpSelected] = useState(true);
  const [printCustSelected, setPrintCustSelected] = useState(true);
  const [printCopies, setPrintCopies] = useState('1');
  const skipPrintCopiesAutoRef = useRef(true);
  const [printPayload, setPrintPayload] = useState(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [procTriggers, setProcTriggers] = useState({});
  const [lockMetadataById, setLockMetadataById] = useState({});
  const lockSignatureRef = useRef('');
  const [temporarySummary, setTemporarySummary] = useState(null);
  const [temporaryScope, setTemporaryScope] = useState('created');
  const [temporaryList, setTemporaryList] = useState([]);
  const [showTemporaryModal, setShowTemporaryModal] = useState(false);
  const [queuedTemporaryTrigger, setQueuedTemporaryTrigger] = useState(null);
  const lastExternalTriggerRef = useRef(null);
  const [temporaryLoading, setTemporaryLoading] = useState(false);
  const [temporaryChainModalVisible, setTemporaryChainModalVisible] =
    useState(false);
  const [temporaryChainModalData, setTemporaryChainModalData] = useState(null);
  const [temporaryChainModalError, setTemporaryChainModalError] = useState('');
  const [temporaryChainModalLoading, setTemporaryChainModalLoading] =
    useState(false);
  const [workflowState, setWorkflowState] = useState({
    isTemporary: false,
    status: null,
  });
  const setTemporaryRowRef = useCallback((id, node) => {
    if (id == null) return;
    const key = String(id);
    const map = temporaryRowRefs.current;
    if (!map) return;
    if (node) {
      map.set(key, node);
    } else {
      map.delete(key);
    }
  }, []);
  const [temporaryFocusId, setTemporaryFocusId] = useState(null);
  const [temporarySelection, setTemporarySelection] = useState(() => new Set());
  const [temporaryValuePreview, setTemporaryValuePreview] = useState(null);
  const [temporaryImagesEntry, setTemporaryImagesEntry] = useState(null);
  const [temporaryUploadEntry, setTemporaryUploadEntry] = useState(null);
  const [rowFormKey, setRowFormKey] = useState(0);
  const rateLimitFallbackMessage = t(
    'rateLimitExceeded',
    'Too many requests, please try again later',
  );
  const getRateLimitMessage = useCallback(
    async (res, fallbackMessage = rateLimitFallbackMessage) => {
      if (res.status !== 429) return null;
      let message = fallbackMessage;
      try {
        const data = await res.clone().json();
        if (data?.message) {
          message = data.message;
        }
      } catch {
        try {
          const text = await res.clone().text();
          if (text) {
            message = text;
          }
        } catch {
          // ignore
        }
      }
      return message;
    },
    [rateLimitFallbackMessage],
  );
  const pendingRequests = usePendingRequests();
  const markTemporaryScopeSeen = pendingRequests?.temporary?.markScopeSeen;
  const temporaryHasNew = Boolean(pendingRequests?.temporary?.hasNew);
  const notificationDots = pendingRequests?.notificationColors || [];
  const temporaryRowRefs = useRef(new Map());
  const autoTemporaryLoadScopesRef = useRef(new Set());
  const promotionHydrationNeededRef = useRef(false);
  useEffect(() => {
    if (skipPrintCopiesAutoRef.current) {
      skipPrintCopiesAutoRef.current = false;
      return;
    }
    if (printEmpSelected || printCustSelected) {
      setPrintCopies('2');
    }
  }, [printEmpSelected, printCustSelected]);
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
  const normalizeEmpId = useCallback((value) => {
    if (value === undefined || value === null) return '';
    const str = String(value).trim();
    return str ? str.toUpperCase() : '';
  }, []);
  const resolveCreatedBy = useCallback(
    (row) =>
      normalizeEmpId(
        row?.created_by ?? row?.createdBy ?? row?.createdby ?? row?.createdBy,
      ),
    [normalizeEmpId],
  );
  const normalizePlanSeniorList = useCallback(
    (value) => {
      const rawList = [];
      if (Array.isArray(value)) {
        rawList.push(...value);
      } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            rawList.push(...parsed);
          } else {
            rawList.push(trimmed);
          }
        } catch {
          rawList.push(trimmed);
        }
      } else if (value !== undefined && value !== null) {
        rawList.push(value);
      }
      return rawList
        .map((id) => normalizeEmpId(id))
        .filter((id) => Boolean(id));
    },
    [normalizeEmpId],
  );
  const {
    user,
    company,
    branch,
    department,
    userSettings,
    session,
    position,
    workplace,
    workplacePositionMap,
  } = useContext(AuthContext);
  const hasSenior = (value) => {
    if (value === null || value === undefined) return false;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric > 0;
    }
    if (typeof value === 'string') {
      return value.trim() !== '' && value.trim() !== '0';
    }
    return Boolean(value);
  };
  const hasDirectSenior = hasSenior(session?.senior_empid);
  const temporaryReviewer =
    Boolean(temporarySummary?.isReviewer) ||
    Number(temporarySummary?.reviewPending) > 0;
  const normalizedViewerEmpId = useMemo(
    () => normalizeEmpId(user?.empid),
    [normalizeEmpId, user?.empid],
  );
  const normalizedViewerDirectSeniorId = useMemo(
    () => normalizeEmpId(session?.senior_plan_empid),
    [normalizeEmpId, session?.senior_plan_empid],
  );
  const employmentSeniorId = useMemo(() => {
    const candidates = [
      session?.employment_senior_empid,
      session?.employment?.senior_empid,
      session?.employment?.senior_emp_id,
      session?.employment?.seniorEmpId,
      session?.employment?.seniorEmpID,
      user?.employment_senior_empid,
      user?.employment?.senior_empid,
      user?.employment?.senior_emp_id,
      user?.employment?.seniorEmpId,
      user?.employment?.seniorEmpID,
    ];
    for (const candidate of candidates) {
      if (hasSenior(candidate)) return candidate;
    }
    return null;
  }, [hasSenior, session?.employment, session?.employment_senior_empid, user?.employment, user?.employment_senior_empid]);
  const hasEmploymentSenior = hasSenior(employmentSeniorId);
  const hasTransactionSenior = hasDirectSenior || hasEmploymentSenior;
  const isSubordinate = hasTransactionSenior;
  const generalConfig = useGeneralConfig();
  const txnToastEnabled = generalConfig.general?.txnToastEnabled;
  const ebarimtToastEnabled = generalConfig.general?.ebarimtToastEnabled;
  const printConfig = generalConfig.print || {};
  const { addToast } = useToast();
  const canRequestStatus = isSubordinate;
  const posApiErrorSignatureRef = useRef('');
  const posApiAvailable = formConfig?.posApiAvailable !== false;
  const posApiEnabled = Boolean(formConfig?.posApiEnabled && posApiAvailable);
  const promotionKeepFields = useMemo(() => {
    const raw =
      formConfig?.temporaryPromoteKeepFields ??
      formConfig?.temporaryPromotionKeepFields ??
      formConfig?.temporary_promote_keep_fields ??
      formConfig?.temporary_promotion_keep_fields ??
      formConfig?.promoteKeepFields ??
      formConfig?.promote_keep_fields ??
      [];
    return Array.isArray(raw)
      ? raw.map((field) => String(field).trim()).filter(Boolean)
      : [];
  }, [
    formConfig?.promoteKeepFields,
    formConfig?.promote_keep_fields,
    formConfig?.temporaryPromoteKeepFields,
    formConfig?.temporaryPromotionKeepFields,
    formConfig?.temporary_promote_keep_fields,
    formConfig?.temporary_promotion_keep_fields,
  ]);

  useEffect(() => {
    if (!formConfig?.posApiEnabled) return;
    const err = formConfig?.posApiRegistryError;
    if (!err) return;
    const signature = JSON.stringify(err);
    if (posApiErrorSignatureRef.current === signature) return;
    posApiErrorSignatureRef.current = signature;
    const pathHint =
      err.registryPath && typeof err.registryPath === 'string' && err.registryPath.trim()
        ? ` (${err.registryPath})`
        : '';
    const messageDetail = err.message || 'POSAPI configuration is unavailable';
    addToast(
      t(
        'posapi_config_unavailable',
        'POSAPI configuration is unavailable: {{detail}}{{pathHint}}',
        { detail: messageDetail, pathHint },
      ),
      'warning',
    );
    addToast(
      t(
        'posapi_fallback_warning',
        'POSAPI is disabled for this transaction. You can continue without it, but please contact a system administrator.',
      ),
      'warning',
    );
  }, [formConfig?.posApiEnabled, formConfig?.posApiRegistryError, addToast, t]);

  const formatTxnToastPayload = useCallback((value) => {
    const maxLength = 500;
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    try {
      const json = JSON.stringify(value);
      if (typeof json === 'string') {
        return json.length > maxLength ? `${json.slice(0, maxLength)}…` : json;
      }
    } catch {}
    const str = String(value);
    return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
  }, []);

  const buildTxnInsertSql = useCallback((tableName, values) => {
    if (!tableName || !values || typeof values !== 'object') return null;
    const entries = Object.entries(values).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return null;
    const sqlValue = (value) => {
      if (value === null || value === undefined) return 'NULL';
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      if (typeof value === 'boolean') return value ? '1' : '0';
      const stringified =
        typeof value === 'string'
          ? value
          : (() => {
              try {
                return JSON.stringify(value);
              } catch {
                return String(value);
              }
            })();
      return `'${stringified.replace(/'/g, "''")}'`;
    };
    const columnsSql = entries.map(([key]) => `\`${key}\``).join(', ');
    const valuesSql = entries.map(([, value]) => sqlValue(value)).join(', ');
    return `INSERT INTO \`${tableName}\` (${columnsSql}) VALUES (${valuesSql});`;
  }, []);

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

  useEffect(() => {
    showFormRef.current = showForm;
  }, [showForm]);

  const branchScopeId = useMemo(() => resolveScopeId(branch), [branch]);
  const departmentScopeId = useMemo(
    () => resolveScopeId(department),
    [department],
  );

  const accessEvaluation = useMemo(
    () =>
      evaluateTransactionFormAccess(
        formConfig,
        branchScopeId,
        departmentScopeId,
        {
          allowTemporaryAnyScope: true,
          userRightId:
            user?.userLevel ??
            user?.userlevel_id ??
            user?.userlevelId ??
            session?.user_level ??
            session?.userlevel_id ??
            session?.userlevelId,
          userRightName:
            user?.userLevelName ??
            user?.userlevel_name ??
            user?.userlevelName ??
            session?.user_level_name ??
            session?.userLevelName ??
            null,
          workplaceId:
            workplace ??
            session?.workplace_id ??
            session?.workplaceId ??
            null,
          positionId:
            position ??
            session?.employment_position_id ??
            session?.position_id ??
            session?.position ??
            user?.position ??
            null,
          workplacePositionMap,
        },
      ),
    [
      formConfig,
      branchScopeId,
      departmentScopeId,
      session,
      user,
      position,
      workplace,
      workplacePositionMap,
    ],
  );

  const formSupportsTemporary = Boolean(
    formConfig?.supportsTemporarySubmission ??
      formConfig?.allowTemporarySubmission ??
      formConfig?.supportsTemporary ??
      false,
  );
  const permission = useMemo(
    () => ({
      canPost:
        accessEvaluation.canPost === undefined
          ? true
          : accessEvaluation.canPost === true,
      canSaveTemporary: Boolean(accessEvaluation.allowTemporary),
      allowTemporaryOnly: Boolean(accessEvaluation.allowTemporaryOnly),
    }),
    [accessEvaluation],
  );
  const canCreateTemporary = Boolean(permission.canSaveTemporary);
  const isSenior =
    Boolean(user?.empid) && (!hasTransactionSenior || temporaryReviewer);
  const canReviewTemporary =
    formSupportsTemporary &&
    Boolean(user?.empid) &&
    (!hasTransactionSenior || temporaryReviewer);
  const supportsTemporary =
    formSupportsTemporary &&
    (canCreateTemporary || canReviewTemporary || temporaryReviewer);
  const isEditingTemporaryDraft = activeTemporaryDraftId != null;
  const canSaveTemporaryDraft = canCreateTemporary || isEditingTemporaryDraft;
  const canPostTransactions = permission.canPost;
  const allowTemporaryOnly = Boolean(permission.allowTemporaryOnly);

  const availableTemporaryScopes = useMemo(() => {
    const scopes = [];
    if (canCreateTemporary) scopes.push('created');
    if (canReviewTemporary) scopes.push('review');
    return scopes;
  }, [canCreateTemporary, canReviewTemporary]);

  const defaultTemporaryScope = useMemo(() => {
    if (availableTemporaryScopes.includes('created')) return 'created';
    if (availableTemporaryScopes.length > 0) return availableTemporaryScopes[0];
    return 'created';
  }, [availableTemporaryScopes]);
  const pendingPromotionHasSeniorAbove = useMemo(() => {
    if (!pendingTemporaryPromotion?.entry) return false;
    const entry = pendingTemporaryPromotion.entry;
    const plannedSeniors = normalizePlanSeniorList(
      entry.planSeniorEmpIds ??
        entry.plan_senior_empid ??
        entry.plan_senior_emp_id ??
        entry.planSeniorEmpID ??
        null,
    );
    return plannedSeniors.some((id) => hasSenior(id));
  }, [normalizePlanSeniorList, pendingTemporaryPromotion]);
  const normalizedPendingPlanSenior = useMemo(() => {
    if (!pendingTemporaryPromotion?.entry) return '';
    const entry = pendingTemporaryPromotion.entry;
    const plannedSenior =
      normalizePlanSeniorList(
        entry.planSeniorEmpIds ??
          entry.plan_senior_empid ??
          entry.plan_senior_emp_id ??
          entry.planSeniorEmpID ??
          null,
      )?.[0] || null;
    return normalizeEmpId(plannedSenior);
  }, [normalizeEmpId, normalizePlanSeniorList, pendingTemporaryPromotion]);
  const isDirectReviewerForPendingPromotion =
    normalizedPendingPlanSenior &&
    normalizedViewerEmpId &&
    normalizedPendingPlanSenior === normalizedViewerEmpId;

  const shouldShowForwardTemporaryLabel =
    Boolean(pendingTemporaryPromotion) &&
    hasTransactionSenior &&
    pendingPromotionHasSeniorAbove;
  const temporarySaveLabel = shouldShowForwardTemporaryLabel
    ? t('save_temporary_forward', 'Save as Temporary and Forward')
    : null;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.canPostTransactions = canPostTransactions;
    }
  }, [canPostTransactions]);

  useEffect(() => {
    if (!supportsTemporary) {
      if (temporaryScope !== 'created') {
        setTemporaryScope('created');
      }
      return;
    }
    if (!availableTemporaryScopes.includes(temporaryScope)) {
      setTemporaryScope(defaultTemporaryScope);
    }
  }, [
    supportsTemporary,
    availableTemporaryScopes,
    temporaryScope,
    defaultTemporaryScope,
  ]);

  useEffect(() => {
    if (!externalTemporaryTrigger) return;
    setQueuedTemporaryTrigger(externalTemporaryTrigger);
  }, [externalTemporaryTrigger]);

  const refreshTemporarySummary = useCallback(async () => {
    if (!formSupportsTemporary) {
      setTemporarySummary(null);
      return;
    }
    try {
      const params = new URLSearchParams();
      if (table) {
        params.set('table', table);
      }
      const temporaryFormName = formName || formConfig?.formName || formConfig?.configName || '';
      const temporaryConfigName = formConfig?.configName || formName || '';
      if (temporaryFormName) {
        params.set('formName', temporaryFormName);
      }
      if (temporaryConfigName) {
        params.set('configName', temporaryConfigName);
      }
      const transactionTypeField = formConfig?.transactionTypeField || '';
      const normalizedTypeFilter = typeof typeFilter === 'string' ? typeFilter.trim() : typeFilter;
      if (transactionTypeField && normalizedTypeFilter) {
        params.set('transactionTypeField', transactionTypeField);
        params.set('transactionTypeValue', normalizedTypeFilter);
      }

      const res = await fetch(
        `${API_BASE}/transaction_temporaries/summary${
          params.size > 0 ? `?${params.toString()}` : ''
        }`,
        {
          credentials: 'include',
        },
      );
      const rateLimitMessage = await getRateLimitMessage(res);
      if (rateLimitMessage) {
        addToast(rateLimitMessage, 'warning');
        return;
      }
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setTemporarySummary(data);
      const reviewPending = Number(data?.reviewPending) || 0;
      const preferredScope =
        availableTemporaryScopes.includes('review') && reviewPending > 0
          ? 'review'
          : defaultTemporaryScope;
      if (!showFormRef.current) {
        setTemporaryScope((prev) => {
          if (!availableTemporaryScopes.includes(prev)) return preferredScope;
          if (
            preferredScope === 'review' &&
            prev !== 'review' &&
            availableTemporaryScopes.includes('review')
          ) {
            return 'review';
          }
          return prev;
        });
      }
    } catch {
      setTemporarySummary((prev) => prev || { createdPending: 0, reviewPending: 0 });
      if (!showFormRef.current) {
        setTemporaryScope((prev) =>
          availableTemporaryScopes.includes(prev)
            ? prev
            : defaultTemporaryScope,
        );
      }
    }
  }, [
    formSupportsTemporary,
    availableTemporaryScopes,
    defaultTemporaryScope,
    table,
    formName,
    formConfig?.formName,
    formConfig?.configName,
    formConfig?.transactionTypeField,
    typeFilter,
    addToast,
    getRateLimitMessage,
  ]);

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

  const dateFieldSet = useMemo(
    () =>
      new Set(
        (formConfig?.dateField || [])
          .map((name) => resolveCanonicalKey(name))
          .filter(Boolean),
      ),
    [formConfig?.dateField, resolveCanonicalKey],
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
      const comment = (c.columnComment || '').toLowerCase();
      if (typ.includes('json') || comment.includes('json_array')) {
        map[c.name] = 'json';
      } else if (typ.match(/int|decimal|numeric|double|float|real|number|bigint/)) {
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

  const normalizeJsonArray = useCallback((value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && 'value' in value) {
      return normalizeJsonArray(value.value);
    }
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
        if (parsed === undefined || parsed === null || parsed === '') return [];
        return [parsed];
      } catch {
        return value ? [value] : [];
      }
    }
    return [value];
  }, []);

  const fetchRelationDisplayConfig = useCallback(
    async (tableName, idField) => {
      if (!tableName) return null;
      const cacheKey = `${tableName}|${idField || ''}`;
      if (displayFieldConfigCache.current.has(cacheKey)) {
        return displayFieldConfigCache.current.get(cacheKey);
      }
      const promise = fetch(
        `/api/display_fields?table=${encodeURIComponent(tableName)}${
          idField ? `&idField=${encodeURIComponent(idField)}` : ''
        }`,
        { credentials: 'include' },
      )
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
      displayFieldConfigCache.current.set(cacheKey, promise);
      return promise;
    },
    [],
  );

  const formatRelationDisplay = useCallback((row, config, fallbackValue) => {
    if (!row || typeof row !== 'object') return fallbackValue ?? '';
    const cfg = config || {};
    const parts = [];
    const idField = cfg.idField || cfg.column;
    const identifier = idField ? getRowValueCaseInsensitive(row, idField) : undefined;
    const idValue =
      identifier !== undefined && identifier !== null && identifier !== ''
        ? identifier
        : fallbackValue;
    if (idValue !== undefined && idValue !== null && idValue !== '') {
      parts.push(idValue);
    }
    (cfg.displayFields || []).forEach((df) => {
      const val = getRowValueCaseInsensitive(row, df);
      if (val !== undefined && val !== null && val !== '') {
        parts.push(val);
      }
    });
    return parts.join(' - ');
  }, []);

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
    setJsonRelationLabels({});
    jsonRelationFetchCache.current = {};
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

  const relationDisplayMap = useMemo(() => {
    const map = {};
    Object.entries(relationConfigs || {}).forEach(([column, config]) => {
      if (!config || !Array.isArray(config.displayFields)) return;
      config.displayFields.forEach((field) => {
        if (typeof field !== 'string' || !field.trim()) return;
        const canonical = resolveCanonicalKey(field) || field;
        if (!canonical || map[canonical]) return;
        map[canonical] = { config, sourceColumn: column };
      });
    });
    return map;
  }, [relationConfigs, resolveCanonicalKey]);

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
    if (formConfig?.defaultValues) {
      const editableDefaults = new Set(
        (formConfig.editableDefaultFields || []).map((f) => resolveCanonicalKey(f) || f),
      );
      Object.entries(formConfig.defaultValues).forEach(([rawKey, value]) => {
        if (value === undefined || value === '') return;
        const canonicalKey = resolveCanonicalKey(rawKey) || rawKey;
        if (!canonicalKey || editableDefaults.has(canonicalKey)) return;
        if (validCols.has(canonicalKey)) newFilters[canonicalKey] = value;
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
        const sortedTypeRows = sortRowsByIndex(data.rows || []);
        const opts = sortedTypeRows.map((r) => ({
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
    if (!formConfig?.transactionTypeField) {
      cacheTemporaryFilter('', '');
      return;
    }
    const normalizedTypeFilter = typeof typeFilter === 'string' ? typeFilter.trim() : typeFilter;
    cacheTemporaryFilter(formConfig.transactionTypeField, normalizedTypeFilter);
  }, [formConfig?.transactionTypeField, typeFilter]);

  useEffect(() => {
    if (!showForm) return;
    relationValueSnapshotRef.current = {
      ...rowDefaults,
      ...(editing || {}),
    };
  }, [editing, rowDefaults, showForm]);

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
    if (hiddenRelationFetchCacheRef.current.table !== table) {
      hiddenRelationFetchCacheRef.current.table = table;
      hiddenRelationFetchCacheRef.current.fields = new Set();
    }

    const snapshotValues = relationValueSnapshotRef.current || {};
    const visibleFieldSet = new Set();
    const requiredFieldSet = new Set();
    const addField = (set) => (field) => {
      const resolved = resolveCanonicalKey(field);
      if (resolved) set.add(resolved);
    };
    walkEditableFieldValues(formConfig?.visibleFields || [], addField(visibleFieldSet));
    walkEditableFieldValues(formConfig?.headerFields || [], addField(visibleFieldSet));
    walkEditableFieldValues(formConfig?.mainFields || [], addField(visibleFieldSet));
    walkEditableFieldValues(formConfig?.footerFields || [], addField(visibleFieldSet));
    walkEditableFieldValues(formConfig?.requiredFields || [], addField(requiredFieldSet));

    const hasMeaningfulValue = (val) => {
      if (val === undefined || val === null || val === '') return false;
      if (Array.isArray(val)) return val.some(hasMeaningfulValue);
      if (typeof val === 'object') {
        if (Object.prototype.hasOwnProperty.call(val, 'value')) {
          return hasMeaningfulValue(val.value);
        }
        return Object.values(val).some(hasMeaningfulValue);
      }
      return true;
    };

    const resolveFieldValue = (field) => {
      const resolved = resolveCanonicalKey(field);
      if (resolved && snapshotValues[resolved] !== undefined) {
        return snapshotValues[resolved];
      }
      if (snapshotValues[field] !== undefined) return snapshotValues[field];
      return undefined;
    };

    const shouldLoadRelationColumn = (field) => {
      const resolved = resolveCanonicalKey(field) || field;
      const isVisible =
        visibleFieldSet.size === 0 || visibleFieldSet.has(resolved);
      const hasValue = hasMeaningfulValue(resolveFieldValue(field));
      const isRequired = requiredFieldSet.has(resolved);
      if (!isVisible && !hasValue) return false;
      const isActive = isVisible || isRequired || hasValue;
      if (!isActive) return false;
      if (!isVisible) {
        const cache = hiddenRelationFetchCacheRef.current.fields;
        if (cache.has(resolved)) return false;
        cache.add(resolved);
      }
      return true;
    };

    function buildCustomRelationsList(customPayload) {
      if (!customPayload || typeof customPayload !== 'object') return [];
      const entries = customPayload.relations || customPayload;
      if (!entries || typeof entries !== 'object') return [];
      const list = [];
      Object.entries(entries).forEach(([column, mappings]) => {
        if (!column || !Array.isArray(mappings)) return;
        mappings.forEach((mapping, idx) => {
          if (!mapping || typeof mapping !== 'object') return;
          if (!mapping.table || !mapping.column) return;
          list.push({
            COLUMN_NAME: column,
            REFERENCED_TABLE_NAME: mapping.table,
            REFERENCED_COLUMN_NAME: mapping.column,
            source: 'custom',
            configIndex: idx,
            ...(mapping.idField ? { idField: mapping.idField } : {}),
            ...(Array.isArray(mapping.displayFields)
              ? { displayFields: mapping.displayFields }
              : {}),
            ...(mapping.combinationSourceColumn
              ? { combinationSourceColumn: mapping.combinationSourceColumn }
              : {}),
            ...(mapping.combinationTargetColumn
              ? { combinationTargetColumn: mapping.combinationTargetColumn }
            : {}),
            ...(mapping.filterColumn ? { filterColumn: mapping.filterColumn } : {}),
            ...(mapping.filterValue !== undefined && mapping.filterValue !== null
              ? { filterValue: mapping.filterValue }
              : {}),
            ...(mapping.isArray || mapping.jsonField || mapping.json_field ? { isArray: true } : {}),
          });
        });
      });
      return list;
    }

    const displayConfigCache = new Map();
    const tenantInfoCache = new Map();
    const tableRowsCache = new Map();
    const relationCache = {};
    const nestedLabelCache = {};
    const referenceLoadErrorTables = new Set();
    const referenceParseErrorTables = new Set();

    const buildRelationLabel = ({
      row,
      keyMap,
      relationColumn,
      cfg,
      nestedLookups,
    }) => {
      if (!row || !keyMap || !relationColumn) {
        return '';
      }
      const lowerColumn = relationColumn.toLowerCase();
      const valueKey = keyMap[lowerColumn];
      const value = valueKey ? row[valueKey] : undefined;

      const idFieldName = cfg?.idField ?? relationColumn;
      const idKey =
        typeof idFieldName === 'string' ? keyMap[idFieldName.toLowerCase()] : undefined;
      const identifier = idKey ? row[idKey] : undefined;

      const parts = [];
      if (identifier !== undefined && identifier !== null && identifier !== '') {
        parts.push(identifier);
      } else if (value !== undefined && value !== null && value !== '') {
        parts.push(value);
      }

      let displayFields = [];
      if (cfg && Array.isArray(cfg.displayFields) && cfg.displayFields.length > 0) {
        displayFields = cfg.displayFields;
      } else {
        displayFields = Object.keys(row)
          .filter((f) => f !== relationColumn)
          .slice(0, 1);
      }

      displayFields.forEach((field) => {
        if (typeof field !== 'string') return;
        const rk = keyMap[field.toLowerCase()];
        if (!rk) return;
        let displayValue = row[rk];
        if (displayValue === undefined || displayValue === null || displayValue === '')
          return;
        const lookup = nestedLookups?.[field.toLowerCase()];
        if (lookup) {
          const mapped =
            lookup[displayValue] !== undefined
              ? lookup[displayValue]
              : lookup[String(displayValue)];
          if (mapped !== undefined) {
            displayValue = mapped;
          }
        }
        parts.push(displayValue);
      });

      const normalizedParts = parts
        .filter((part) => part !== undefined && part !== null && part !== '')
        .map((part) => (typeof part === 'string' ? part : String(part)));
      if (normalizedParts.length > 0) {
        return normalizedParts.join(' - ');
      }
      const fallback = Object.values(row)
        .filter((v) => v !== undefined && v !== null && v !== '')
        .slice(0, 2)
        .map((v) => (typeof v === 'string' ? v : String(v)));
      return fallback.join(' - ');
    };

    const fetchDisplayConfig = (tableName, filter) => {
      if (!tableName) return Promise.resolve(null);
      const filterColumn =
        filter?.column || filter?.filterColumn || filter?.filter_column || '';
      const hasFilterValue =
        filterColumn &&
        (filter?.value !== undefined && filter?.value !== null
          ? true
          : filter?.filterValue !== undefined && filter?.filterValue !== null);
      const filterValue =
        filter?.value ?? filter?.filterValue ?? filter?.filter_value ?? '';
      const cacheKeyParts = [tableName.toLowerCase()];
      if (filterColumn) cacheKeyParts.push(`fc:${filterColumn}`);
      if (filterColumn && hasFilterValue) cacheKeyParts.push(`fv:${String(filterValue)}`);
      const cacheKey = cacheKeyParts.join('|');
      if (displayConfigCache.has(cacheKey)) return displayConfigCache.get(cacheKey);
      const promise = (async () => {
        try {
          const params = new URLSearchParams({ table: tableName });
          if (filterColumn) params.set('filterColumn', filterColumn);
          if (filterColumn && hasFilterValue) {
            params.set('filterValue', String(filterValue).trim());
          }
          const res = await safeRequest(`/api/display_fields?${params.toString()}`, {
            credentials: 'include',
            skipLoader: true,
          });
          if (!res.ok) {
            if (!canceled) {
              addToast(
                t('failed_load_display_fields', 'Failed to load display fields'),
                'error',
              );
            }
            return null;
          }
          const json = await res.json().catch(() => {
            if (!canceled) {
              addToast(
                t('failed_parse_display_fields', 'Failed to parse display fields'),
                'error',
              );
            }
            return null;
          });
          if (!json) return null;
          return {
            idField: typeof json.idField === 'string' ? json.idField : undefined,
            displayFields: Array.isArray(json.displayFields)
              ? json.displayFields
              : [],
            filters: Array.isArray(json.filters) ? json.filters : [],
          };
        } catch (err) {
          if (!canceled) {
            addToast(
              t('failed_load_display_fields', 'Failed to load display fields'),
              'error',
            );
          }
          return null;
        }
      })();
      displayConfigCache.set(cacheKey, promise);
      return promise;
    };

    const fetchTenantInfo = (tableName) => {
      if (!tableName) return Promise.resolve({});
      const cacheKey = tableName.toLowerCase();
      if (tenantInfoCache.has(cacheKey)) return tenantInfoCache.get(cacheKey);
      const promise = (async () => {
        try {
          const res = await fetch(
            `/api/tenant_tables/${encodeURIComponent(tableName)}`,
            { credentials: 'include', skipErrorToast: true, skipLoader: true },
          );
          if (!res.ok) return {};
          const json = await res.json().catch(() => ({}));
          return json || {};
        } catch {
          return {};
        }
      })();
      tenantInfoCache.set(cacheKey, promise);
      return promise;
    };

    const fetchRelationMapForTable = async (tableName) => {
      if (!tableName) return {};
      const cacheKey = tableName.toLowerCase();
      if (relationCache[cacheKey]) return relationCache[cacheKey];
      try {
        const relRes = await fetch(
          `/api/tables/${encodeURIComponent(tableName)}/relations`,
          { credentials: 'include', skipErrorToast: true, skipLoader: true },
        );
        if (!relRes.ok) {
          relationCache[cacheKey] = {};
          return relationCache[cacheKey];
        }
        const relList = await relRes.json().catch(() => []);
        if (canceled) return {};
        const relMap = {};
        relList.forEach((entry) => {
          if (!entry?.COLUMN_NAME || !entry?.REFERENCED_TABLE_NAME) return;
          const lower = entry.COLUMN_NAME.toLowerCase();
          relMap[lower] = {
            table: entry.REFERENCED_TABLE_NAME,
            column: entry.REFERENCED_COLUMN_NAME,
            ...(entry.idField ? { idField: entry.idField } : {}),
            ...(Array.isArray(entry.displayFields)
              ? { displayFields: entry.displayFields }
              : {}),
            ...(entry.combinationSourceColumn
              ? { combinationSourceColumn: entry.combinationSourceColumn }
              : {}),
            ...(entry.combinationTargetColumn
              ? { combinationTargetColumn: entry.combinationTargetColumn }
              : {}),
            ...(entry.filterColumn ? { filterColumn: entry.filterColumn } : {}),
            ...(entry.filterValue !== undefined && entry.filterValue !== null
              ? { filterValue: entry.filterValue }
              : {}),
          };
        });
        relationCache[cacheKey] = relMap;
        return relMap;
      } catch {
        relationCache[cacheKey] = {};
        return {};
      }
    };

    const fetchTableRows = (tableName, tenantInfo, filter) => {
      if (!tableName) return Promise.resolve([]);
      const cacheKeyParts = [tableName.toLowerCase(), company ?? ''];
      if (filter?.column && filter?.value !== undefined && filter.value !== null) {
        cacheKeyParts.push(`${filter.column}:${filter.value}`);
      }
      const cacheKey = cacheKeyParts.join('|');
      if (tableRowsCache.has(cacheKey)) return tableRowsCache.get(cacheKey);
      const promise = (async () => {
        const info = tenantInfo || (await fetchTenantInfo(tableName));
        const isShared = info?.isShared ?? info?.is_shared ?? false;
        const tenantKeys = getTenantKeyList(info);
        const perPage = 500;
        let page = 1;
        const rows = [];
        while (!canceled) {
          const params = new URLSearchParams({ page, perPage });
          if (!isShared && tenantKeys.includes('company_id') && company != null)
            params.set('company_id', company);
          if (filter?.column && filter?.value !== undefined && filter.value !== null) {
            params.set(filter.column, filter.value);
          }
          let res;
          try {
            res = await safeRequest(
              `/api/tables/${encodeURIComponent(tableName)}?${params.toString()}`,
              { credentials: 'include', skipLoader: true },
            );
          } catch (err) {
            if (!canceled && !referenceLoadErrorTables.has(cacheKey)) {
              referenceLoadErrorTables.add(cacheKey);
              addToast(
                t('failed_load_reference_data', 'Failed to load reference data'),
                'error',
              );
            }
            break;
          }
          if (!res.ok) {
            if (!canceled && !referenceLoadErrorTables.has(cacheKey)) {
              referenceLoadErrorTables.add(cacheKey);
              addToast(
                t('failed_load_reference_data', 'Failed to load reference data'),
                'error',
              );
            }
            break;
          }
          const json = await res.json().catch(() => {
            if (!canceled && !referenceParseErrorTables.has(cacheKey)) {
              referenceParseErrorTables.add(cacheKey);
              addToast(
                t('failed_parse_reference_data', 'Failed to parse reference data'),
                'error',
              );
            }
            return {};
          });
          const pageRows = Array.isArray(json.rows) ? json.rows : [];
          rows.push(...pageRows);
          if (
            pageRows.length < perPage ||
            rows.length >= (json.count || rows.length)
          ) {
            break;
          }
          page += 1;
        }
        return rows;
      })();
      tableRowsCache.set(cacheKey, promise);
      return promise;
    };

    const fetchNestedLabelMap = async (nestedRel) => {
      if (!nestedRel?.table || !nestedRel?.column) return {};
      const cacheKey = [
        nestedRel.table.toLowerCase(),
        nestedRel.column.toLowerCase(),
        company ?? '',
        branch ?? '',
        department ?? '',
        nestedRel.filterColumn || '',
        nestedRel.filterValue ?? '',
      ].join('|');
      if (nestedLabelCache[cacheKey]) return nestedLabelCache[cacheKey];

      const [nestedCfg, nestedTenant] = await Promise.all([
        fetchDisplayConfig(nestedRel.table, {
          column: nestedRel.filterColumn,
          value: nestedRel.filterValue,
        }),
        fetchTenantInfo(nestedRel.table),
      ]);
      if (canceled) return {};

      const hasFilterValue =
        nestedRel.filterValue !== undefined && nestedRel.filterValue !== null;
      const filterConfig =
        nestedRel.filterColumn && (hasFilterValue || nestedRel.filterValue === '')
          ? { column: nestedRel.filterColumn, value: nestedRel.filterValue }
          : null;
      const rows = await fetchTableRows(nestedRel.table, nestedTenant, filterConfig);
      if (canceled) return {};

      const labelMap = {};
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const keyMap = {};
        Object.keys(row || {}).forEach((k) => {
          keyMap[k.toLowerCase()] = k;
        });
        const colKey = keyMap[nestedRel.column.toLowerCase()];
        if (!colKey) return;
        const val = row[colKey];
        if (val === undefined || val === null || val === '') return;
        const label = buildRelationLabel({
          row,
          keyMap,
          relationColumn: nestedRel.column,
          cfg: nestedCfg,
          nestedLookups: {},
        });
        const valueKey =
          typeof val === 'string' || typeof val === 'number' ? String(val) : val;
        labelMap[valueKey] = label;
      });

      nestedLabelCache[cacheKey] = labelMap;
      return labelMap;
    };

    const loadNestedDisplayLookups = async (tableName, displayFields) => {
      if (!Array.isArray(displayFields) || displayFields.length === 0) return {};
      const relationMap = await fetchRelationMapForTable(tableName);
      if (!relationMap || Object.keys(relationMap).length === 0) return {};
      const lookupMap = {};
      for (const field of displayFields) {
        if (typeof field !== 'string') continue;
        const lower = field.toLowerCase();
        const nestedRel = relationMap[lower];
        if (!nestedRel) continue;
        const labels = await fetchNestedLabelMap(nestedRel);
        if (canceled) return {};
        if (labels && Object.keys(labels).length > 0) {
          lookupMap[lower] = labels;
        }
      }
      return lookupMap;
    };

    const loadRelationColumn = async ([col, rel]) => {
      if (!rel?.table || !rel?.column) return null;
      if (!shouldLoadRelationColumn(col)) return null;
      const [cfg, tenantInfo] = await Promise.all([
        fetchDisplayConfig(rel.table, {
          column: rel.filterColumn,
          value: rel.filterValue,
        }),
        fetchTenantInfo(rel.table),
      ]);
      if (canceled) return null;

      const normalizedCfg = {
        idField: rel.idField || cfg?.idField || rel.column,
        displayFields: Array.isArray(rel.displayFields)
          ? rel.displayFields
          : Array.isArray(cfg?.displayFields)
          ? cfg.displayFields
          : [],
      };
      if (typeof cfg?.indexField === 'string' && cfg.indexField.trim()) {
        normalizedCfg.indexField = cfg.indexField.trim();
      }
      if (Array.isArray(cfg?.indexFields)) {
        const deduped = Array.from(
          new Set(
            cfg.indexFields
              .filter((field) => typeof field === 'string' && field.trim())
              .map((field) => field.trim()),
          ),
        );
        if (deduped.length > 0) {
          normalizedCfg.indexFields = deduped;
        }
      }

      const hasFilterValue = rel.filterValue !== undefined && rel.filterValue !== null;
      const filterConfig =
        rel.filterColumn && hasFilterValue
          ? { column: rel.filterColumn, value: rel.filterValue }
          : null;
      const rows = await fetchTableRows(rel.table, tenantInfo, filterConfig);
      if (canceled) return null;

      const sortedRows = sortRowsByIndex(rows, {
        indexField: normalizedCfg.indexField,
        indexFields: normalizedCfg.indexFields,
      });

      const nestedDisplayLookups = await loadNestedDisplayLookups(
        rel.table,
        normalizedCfg.displayFields,
      );
      if (canceled) return null;

      const optionRows = {};
      const options = sortedRows.map((row) => {
        const keyMap = {};
        Object.keys(row || {}).forEach((k) => {
          keyMap[k.toLowerCase()] = k;
        });
        const valKey = keyMap[rel.column.toLowerCase()];
        const val = valKey ? row[valKey] : undefined;
        const indexInfo = extractRowIndex(row, {
          indexField: normalizedCfg.indexField,
          indexFields: normalizedCfg.indexFields,
        });
        const label = buildRelationLabel({
          row,
          keyMap,
          relationColumn: rel.column,
          cfg: normalizedCfg,
          nestedLookups: nestedDisplayLookups,
        });
        if (val !== undefined) {
          addRelationRowEntry(optionRows, val, row);
        }
        return {
          value: val,
          label,
          ...(indexInfo
            ? {
                __index: indexInfo.numeric
                  ? indexInfo.sortValue
                  : indexInfo.rawValue,
              }
            : {}),
        };
      });

      return {
        column: col,
        config: {
          table: rel.table,
          column: rel.column,
          idField: normalizedCfg.idField,
          displayFields: normalizedCfg.displayFields,
          ...(normalizedCfg.indexField
            ? { indexField: normalizedCfg.indexField }
            : {}),
          ...(Array.isArray(normalizedCfg.indexFields)
            ? { indexFields: normalizedCfg.indexFields }
            : {}),
          ...(rel.combinationSourceColumn
            ? { combinationSourceColumn: rel.combinationSourceColumn }
            : {}),
          ...(rel.combinationTargetColumn
            ? { combinationTargetColumn: rel.combinationTargetColumn }
            : {}),
          ...(filterConfig
            ? { filterColumn: filterConfig.column, filterValue: filterConfig.value }
            : {}),
          ...(rel.isArray ? { isArray: true } : {}),
          ...(Object.keys(nestedDisplayLookups || {}).length > 0
            ? { nestedLookups: nestedDisplayLookups }
            : {}),
        },
        options,
        rows: optionRows,
      };
    };

    async function load() {
      try {
        let rels = [];
        let relRes;
        let unauthorized = false;
        try {
          relRes = await fetch(
            `/api/tables/${encodeURIComponent(table)}/relations`,
            { credentials: 'include', skipErrorToast: true, skipLoader: true },
          );
          unauthorized = relRes?.status === 403;
        } catch (err) {
          relRes = { ok: false, status: 0, error: err };
        }
        if (relRes?.ok) {
          rels = await relRes.json().catch(() => {
            if (!canceled) {
              addToast(
                t('failed_parse_table_relations', 'Failed to parse table relations'),
                'error',
              );
            }
            return [];
          });
        } else {
          let customList = [];
          try {
            const customRes = await fetch(
              `/api/tables/${encodeURIComponent(table)}/relations/custom`,
              { credentials: 'include', skipErrorToast: true, skipLoader: true },
            );
            unauthorized = unauthorized || customRes?.status === 403;
            if (customRes.ok) {
              const customJson = await customRes.json().catch(() => ({}));
              customList = buildCustomRelationsList(customJson);
            }
          } catch {
            /* ignore */
          }
          if (customList.length === 0) {
            if (!canceled && !unauthorized) {
              addToast(
                t('failed_load_table_relations', 'Failed to load table relations'),
                'error',
              );
            }
            if (!canceled) {
              setRelations({});
              setRefData({});
              setRefRows({});
              setRelationConfigs({});
            }
            return;
          }
        rels = customList;
        }
        if (canceled) return;

        const relationMap = {};
        rels.forEach((r) => {
          const key = resolveCanonicalKey(r.COLUMN_NAME);
          relationMap[key] = {
            table: r.REFERENCED_TABLE_NAME,
            column: r.REFERENCED_COLUMN_NAME,
            ...(r.idField ? { idField: r.idField } : {}),
            ...(Array.isArray(r.displayFields) ? { displayFields: r.displayFields } : {}),
            ...(r.combinationSourceColumn
              ? { combinationSourceColumn: r.combinationSourceColumn }
              : {}),
            ...(r.combinationTargetColumn
              ? { combinationTargetColumn: r.combinationTargetColumn }
              : {}),
            ...(r.filterColumn ? { filterColumn: r.filterColumn } : {}),
            ...(r.filterValue !== undefined && r.filterValue !== null
              ? { filterValue: r.filterValue }
              : {}),
            ...(r.isArray ? { isArray: true } : {}),
          };
        });
        setRelations(relationMap);

        const entries = Object.entries(relationMap);
        if (entries.length === 0) {
          setRefData({});
          setRefRows({});
          setRelationConfigs({});
          return;
        }

        const results = await Promise.allSettled(entries.map(loadRelationColumn));
        if (canceled) return;

        const dataMap = {};
        const cfgMap = {};
        const rowMap = {};
        results.forEach((result) => {
          if (result.status !== 'fulfilled' || !result.value) return;
          const { column, config, options, rows: columnRows } = result.value;
          if (Array.isArray(options)) {
            dataMap[column] = options;
          }
          if (columnRows && Object.keys(columnRows).length > 0) {
            rowMap[column] = columnRows;
          }
          if (config) {
            cfgMap[column] = config;
          }
        });

        const aliasEntries = [];
        Object.entries(cfgMap).forEach(([column, config]) => {
          const idFieldName =
            typeof config?.idField === 'string' ? config.idField : null;
          if (!idFieldName) return;
          const canonicalColumn = resolveCanonicalKey(column);
          const canonicalIdField = resolveCanonicalKey(idFieldName);
          if (!canonicalIdField || canonicalIdField === canonicalColumn) return;
          if (!validCols.has(canonicalIdField)) return;
          aliasEntries.push({
            alias: canonicalIdField,
            source: column,
            config,
          });
        });

        aliasEntries.forEach(({ alias, source, config }) => {
          if (!cfgMap[alias]) {
            cfgMap[alias] = { ...config };
          }
          if (dataMap[source] && !dataMap[alias]) {
            dataMap[alias] = dataMap[source];
          }
          if (rowMap[source] && !rowMap[alias]) {
            const aliasRows = {};
            Object.values(rowMap[source]).forEach((row) => {
              if (!row || typeof row !== 'object') return;
              const keyMap = {};
              Object.keys(row).forEach((key) => {
                keyMap[key.toLowerCase()] = key;
              });
              const idFieldName = config?.idField;
              if (typeof idFieldName !== 'string' || idFieldName.length === 0) {
                return;
              }
              const idKey = keyMap[idFieldName.toLowerCase()] || idFieldName;
              const identifier = row[idKey];
              if (identifier !== undefined && identifier !== null) {
                addRelationRowEntry(aliasRows, identifier, row);
              }
            });
            if (Object.keys(aliasRows).length > 0) {
              rowMap[alias] = aliasRows;
            }
          }
        });

        setRefData(dataMap);
        setRefRows(rowMap);
        const remap = {};
        Object.entries(cfgMap).forEach(([k, v]) => {
          const key = resolveCanonicalKey(k);
          remap[key] = v;
        });
        setRelationConfigs(remap);
      } catch (err) {
        console.error('Failed to load table relations', err);
        if (!canceled) {
          addToast(
            t('failed_load_table_relations', 'Failed to load table relations'),
            'error',
          );
        }
      }
    }

    load();
    return () => {
      canceled = true;
    };
  }, [
    table,
    company,
    branch,
    department,
    formConfig,
    resolveCanonicalKey,
    showForm,
    validCols,
  ]);

  useEffect(() => {
    if (!table || columnMeta.length === 0) return;
    let canceled = false;
    const controller = new AbortController();
    const params = new URLSearchParams({ page, perPage });
    if (company != null && validCols.has('company_id'))
      params.set('company_id', company);
    if (sort.column && validCols.has(sort.column)) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    let hasInvalidDateFilter = false;
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined && validCols.has(k)) {
        if (dateFieldSet.has(k)) {
          if (isValidDateFilterValue(v)) {
            params.set(k, v);
          } else {
            hasInvalidDateFilter = true;
          }
        } else {
          params.set(k, v);
        }
      }
    });
    if (hasInvalidDateFilter) return;
    fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
      credentials: 'include',
      signal: controller.signal,
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
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!canceled)
          addToast(
            t('failed_load_table_data', 'Failed to load table data'),
            'error',
          );
      });
    return () => {
      canceled = true;
      controller.abort();
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
  }, [table, page, perPage, filters, sort, refreshId, localRefresh, dateFieldSet]);

  useEffect(() => {
    if (!table || !Array.isArray(rows) || rows.length === 0) {
      if (lockSignatureRef.current) lockSignatureRef.current = '';
      if (Object.keys(lockMetadataById).length > 0) {
        setLockMetadataById({});
      }
      return;
    }
    const lockedEntries = rows.reduce((acc, row) => {
      if (!rowHasActiveLock(row)) return acc;
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

  const resolveImageNameForRow = useCallback(
    (row, config = {}) => {
      if (!row || typeof row !== 'object') return '';
      const imagenameFields = Array.isArray(config?.imagenameField)
        ? config.imagenameField
        : [];
      const imageIdField =
        typeof config?.imageIdField === 'string' ? config.imageIdField : '';
      const { primary } = resolveImageNames({
        row,
        columnCaseMap,
        company,
        imagenameFields,
        imageIdField,
        configs: allConfigs,
        currentConfig: formConfig,
        currentConfigName: formName,
      });
      return primary || '';
    },
    [allConfigs, columnCaseMap, company, formConfig, formName],
  );

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
    const { matches } = getConfigMatchesForRow(row);
    if (matches.length > 0) return matches[0].config;
    return formConfig || {};
  }

  function getMatchingConfigsForRow(row) {
    if (!row) return [];
    return getConfigMatchesForRow(row).matches.map(({ configName, config }) => ({
      configName,
      config,
    }));
  }

  function getTransactionTypeFields() {
    const fields = [];
    if (formConfig?.transactionTypeField) {
      fields.push(formConfig.transactionTypeField);
    }
    Object.values(allConfigs || {}).forEach((cfg) => {
      if (cfg?.transactionTypeField) fields.push(cfg.transactionTypeField);
    });
    return dedupeFields(fields);
  }

  function getRowTransactionTypeValue(row, fields = getTransactionTypeFields()) {
    if (!row) return { value: '', field: '' };
    for (const field of fields) {
      const val = getCase(row, field);
      if (val !== undefined && val !== null && String(val) !== '') {
        return { value: val, field };
      }
    }
    return {
      value: '',
      field: '',
    };
  }

  function getConfigMatchesForRow(row) {
    if (!row) return { matches: [], fields: [], value: '', matchedField: '' };
    const fields = getTransactionTypeFields();
    const { value, field: matchedField } = getRowTransactionTypeValue(row, fields);
    const matches = [];
    const normalizedValue = value != null ? String(value) : '';
    for (const [configName, cfg] of Object.entries(allConfigs || {})) {
      if (!cfg?.transactionTypeValue) continue;
      if (!normalizedValue) continue;
      if (String(cfg.transactionTypeValue) !== normalizedValue) continue;
      if (cfg.transactionTypeField) {
        if (!fields.includes(cfg.transactionTypeField)) continue;
        matches.push({
          configName,
          config: cfg,
          matchedField: cfg.transactionTypeField,
        });
        continue;
      }
      if (matchedField) {
        matches.push({
          configName,
          config: { ...cfg, transactionTypeField: matchedField },
          matchedField,
        });
      }
    }
    return { matches, fields, value: normalizedValue, matchedField };
  }

  function hasImageFields(config) {
    return (
      (Array.isArray(config?.imagenameField) && config.imagenameField.length > 0) ||
      Boolean(config?.imageIdField)
    );
  }

  function dedupeFields(fields = []) {
    const seen = new Set();
    const deduped = [];
    fields.forEach((field) => {
      if (!field) return;
      const key = String(field);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(field);
    });
    return deduped;
  }

  function getImageConfigForRow(row, fallbackConfig = formConfig || {}) {
    if (!row) return fallbackConfig || {};
    const matches = getMatchingConfigsForRow(row);
    const imageMatches = matches.filter(({ config }) => hasImageFields(config));
    const sourceEntries = imageMatches.length > 0 ? imageMatches : matches;
    const imageFields = [];
    sourceEntries.forEach(({ config }) => {
      if (Array.isArray(config?.imagenameField)) {
        imageFields.push(...config.imagenameField);
      }
      if (typeof config?.imageIdField === 'string' && config.imageIdField) {
        imageFields.push(config.imageIdField);
      }
    });
    const combinedFields = dedupeFields(imageFields);
    if (combinedFields.length === 0) {
      if (hasImageFields(fallbackConfig)) {
        return {
          ...fallbackConfig,
          imagenameField: dedupeFields([
            ...(fallbackConfig?.imagenameField || []),
            fallbackConfig?.imageIdField || '',
          ]),
          imageIdField:
            typeof fallbackConfig?.imageIdField === 'string'
              ? fallbackConfig.imageIdField
              : '',
        };
      }
      return fallbackConfig || {};
    }
    const imageIdField =
      sourceEntries
        .map(({ config }) =>
          typeof config?.imageIdField === 'string' ? config.imageIdField : '',
        )
        .find(Boolean) ||
      (typeof fallbackConfig?.imageIdField === 'string'
        ? fallbackConfig.imageIdField
        : '');
    return {
      ...fallbackConfig,
      imagenameField: combinedFields,
      imageIdField: imageIdField || '',
    };
  }

  function resolveImageNameForSearch(row) {
    if (!row) return '';
    const imageConfig = getImageConfigForRow(row, formConfig || {});
    return resolveImageNameForRow(row, imageConfig);
  }

  function resolveImageNameWithFallback(row, config = {}) {
    if (!row) return '';
    const primaryName = resolveImageNameForRow(row, config);
    if (primaryName) return primaryName;
    return resolveImageNameForSearch(row);
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

  const resetWorkflowState = useCallback(() => {
    setWorkflowState({ isTemporary: false, status: null });
  }, []);

  async function openAdd() {
    resetWorkflowState();
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
      if (txnToastEnabled) {
        addToast(
          'Transaction toast: Missing primary key for edit operation',
          'info',
        );
      }
      addToast(
        t('cannot_edit_without_pk', 'Cannot edit rows without a primary key'),
        'error',
      );
      return;
    }
    resetWorkflowState();
    const meta = await ensureColumnMeta();
    const cols = Array.isArray(meta) && meta.length > 0 ? meta : columnMeta;
    const localCaseMap =
      Array.isArray(cols) && cols.length > 0
        ? buildColumnCaseMap(cols)
        : columnCaseMap;
    if (txnToastEnabled) {
      const resolvedKeys = Object.keys(localCaseMap || {});
      addToast(
        `Transaction toast: Resolved key columns ${formatTxnToastPayload({
          count: resolvedKeys.length,
          sample: resolvedKeys.slice(0, 10),
        })}`,
        'info',
      );
    }
    const id = getRowId(row);
    addToast(t('loading_record', 'Loading record...'));

    const normalizedRow = normalizeToCanonical(row, localCaseMap);

    let tenantInfo = null;
    try {
      const ttRes = await fetch(
        `/api/tenant_tables/${encodeURIComponent(table)}`,
        { credentials: 'include', skipErrorToast: true, skipLoader: true },
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
    }
    if (txnToastEnabled) {
      const paramEntries = Array.from(params.entries());
      addToast(
        `Transaction toast: Tenant params ${formatTxnToastPayload(
          paramEntries.length > 0 ? paramEntries : 'none',
        )}`,
        'info',
      );
    }

    const url = `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
      params.toString() ? `?${params.toString()}` : ''
    }`;
    if (txnToastEnabled) {
      addToast(`Transaction toast: Fetch URL ${url}`, 'info');
    }

    let payload = null;
    let lastResponseInfo = null;
    try {
      const res = await fetch(url, { credentials: 'include' });
      lastResponseInfo = {
        status: res?.status,
        statusText: res?.statusText,
        url,
      };
      if (!res.ok) {
        if (txnToastEnabled) {
          addToast(
            `Transaction toast: Record fetch failed ${formatTxnToastPayload({
              status: res.status,
              statusText: res.statusText,
            })}`,
            'error',
          );
        }
        throw new Error('Failed to load record');
      }
      try {
        payload = await res.json();
      } catch (jsonErr) {
        if (txnToastEnabled) {
          addToast(
            `Transaction toast: Record fetch parse failed ${formatTxnToastPayload({
              status: res.status,
              statusText: res.statusText,
              error: jsonErr?.message ?? String(jsonErr),
            })}`,
            'error',
          );
        }
        throw jsonErr;
      }
      if (txnToastEnabled) {
        addToast(
          `Transaction toast: Success payload ${formatTxnToastPayload(payload)}`,
          'info',
        );
      }
    } catch (err) {
      if (txnToastEnabled) {
        addToast(
          `Transaction toast: Edit flow failed ${formatTxnToastPayload({
            error: {
              message: err?.message ?? String(err),
              stack: err?.stack,
              name: err?.name,
            },
            response: lastResponseInfo,
          })}`,
          'error',
        );
      }
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
      if (txnToastEnabled) {
        addToast(
          `Transaction toast: Record not found ${formatTxnToastPayload(payload)}`,
          'info',
        );
      }
      addToast(t('failed_load_record', 'Failed to load record details'), 'error');
      return;
    }

    const normalizedRecord = normalizeToCanonical(record, localCaseMap);
    if (txnToastEnabled) {
      addToast(
        `Transaction toast: Canonical record ${formatTxnToastPayload(normalizedRecord)}`,
        'info',
      );
    }
    const mergedRow = { ...normalizedRow };
    for (const [key, value] of Object.entries(normalizedRecord)) {
      mergedRow[key] = value;
    }

    if (txnToastEnabled) {
      addToast(
        `Transaction toast: Edit modal payload ${formatTxnToastPayload({
          mergedRow,
          willOpenModal: true,
        })}`,
        'info',
      );
    }

    setEditing(mergedRow);
    setGridRows([mergedRow]);
    setIsAdding(false);
    setShowForm(true);
  }

  async function openRequestEdit(row) {
    const rowId = getRowId(row);
    if (rowId === undefined) {
      if (txnToastEnabled) {
        addToast(
          `Transaction toast: Missing primary key for edit request ${formatTxnToastPayload(
            row,
          )}`,
          'info',
        );
      }
      addToast(
        t('cannot_edit_without_pk', 'Cannot edit rows without a primary key'),
        'error',
      );
      return;
    }
    if (txnToastEnabled) {
      addToast(
        `Transaction toast: Request edit start ${formatTxnToastPayload({
          rowId,
          reasonModalVisible: showReasonModal,
        })}`,
        'info',
      );
    }
    const meta = await ensureColumnMeta();
    const cols = Array.isArray(meta) && meta.length > 0 ? meta : columnMeta;
    const localCaseMap =
      Array.isArray(cols) && cols.length > 0
        ? buildColumnCaseMap(cols)
        : columnCaseMap;
    const normalizedRow = normalizeToCanonical(row, localCaseMap);
    const rowForForm =
      normalizedRow && Object.keys(normalizedRow).length > 0 ? normalizedRow : row;
    if (txnToastEnabled) {
      addToast(
        `Transaction toast: Request edit normalized payload ${formatTxnToastPayload(
          rowForForm,
        )}`,
        'info',
      );
    }
    setEditing(rowForForm);
    setGridRows([rowForForm]);
    setIsAdding(false);
    setRequestType('edit');
    if (txnToastEnabled) {
      addToast(
        `Transaction toast: Preparing edit request modal ${formatTxnToastPayload({
          requestType: 'edit',
          reasonModalVisible: showReasonModal,
        })}`,
        'info',
      );
    }
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
          { credentials: 'include', skipErrorToast: true, skipLoader: true },
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

  function showImageSearchToast(row, tableName = table) {
    if (!generalConfig.general?.imageToastEnabled) return;
    if (!row || typeof row !== 'object') return;
    const { matches, fields, value } = getConfigMatchesForRow(row);
    const matchedTypeFields = dedupeFields(
      matches.map((match) => match.matchedField).filter(Boolean),
    );
    const imageConfig = getImageConfigForRow(row, formConfig || {});
    const buildFields = dedupeFields([
      ...(Array.isArray(imageConfig?.imagenameField)
        ? imageConfig.imagenameField
        : []),
      imageConfig?.imageIdField || '',
    ]);
    addToast(
      `Transaction type value: ${value || 'none'}`,
      'info',
    );
    addToast(
      `Transaction type fields: ${fields.join(', ') || 'none'}`,
      'info',
    );
    addToast(
      `Matched transaction type fields: ${matchedTypeFields.join(', ') || 'none'}`,
      'info',
    );
    addToast(`Image build fields: ${buildFields.join(', ') || 'none'}`, 'info');
    const name = resolveImageNameForSearch(row);
    const folder = getImageFolder(row);
    const details = [
      name ? `name=${name}` : null,
      folder ? `folder=${folder}` : null,
      tableName ? `table=${tableName}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    addToast(
      t('image_searching_name', 'Searching images for: {{details}}', {
        details: details || t('image_searching_unknown', 'unknown'),
      }),
      'info',
    );
  }

  function openImages(row) {
    showImageSearchToast(row);
    setImagesRow(row);
  }

  function openUpload(row) {
    setUploadRow(row);
  }

  function openContextMenu(e, term) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, term });
  }

  const hydrateDisplayFromWrappedRelations = useCallback(
    function hydrateDisplayFromWrappedRelations(values, seen = new WeakSet()) {
      if (!values || typeof values !== 'object') return values || {};
      if (seen.has(values)) return values;
      seen.add(values);

      const hasMeaningfulValue = (val) => {
        if (val === undefined || val === null) return false;
        if (typeof val === 'string') return val.trim().length > 0;
        return true;
      };

      const collectWrapperDisplay = (val) => {
        if (val === undefined || val === null) return null;
        if (Array.isArray(val)) {
          for (const item of val) {
            const display = collectWrapperDisplay(item);
            if (display) return display;
          }
          return null;
        }
        if (val && typeof val === 'object') {
          const displayEntries = {};
          Object.entries(val).forEach(([k, v]) => {
            if (k === 'value') return;
            if (v !== undefined && v !== null) {
              displayEntries[k] = v;
            }
          });
          if (Object.keys(displayEntries).length > 0) return displayEntries;
          if (Object.prototype.hasOwnProperty.call(val, 'value')) {
            return collectWrapperDisplay(val.value);
          }
        }
        return null;
      };

      let hydrated = values;
      const ensureHydrated = () => {
        if (hydrated === values) {
          hydrated = { ...values };
        }
      };

      Object.entries(relationConfigs || {}).forEach(([rawField, config]) => {
        if (!config || !Array.isArray(config.displayFields) || config.displayFields.length === 0) {
          return;
        }
        const canonicalField = resolveCanonicalKey(rawField);
        if (!canonicalField) return;
        const relationValue =
          hydrated === values ? values[canonicalField] : hydrated[canonicalField];
        if (!hasMeaningfulValue(relationValue)) return;
        const wrapperDisplay = collectWrapperDisplay(relationValue);
        if (!wrapperDisplay) return;

        const wrapperKeyMap = {};
        Object.entries(wrapperDisplay).forEach(([k, v]) => {
          wrapperKeyMap[k.toLowerCase()] = v;
        });

        config.displayFields.forEach((displayField) => {
          if (typeof displayField !== 'string' || !displayField.trim()) return;
          const canonicalDisplay = resolveCanonicalKey(displayField);
          if (!canonicalDisplay) return;
          const currentValue =
            hydrated === values ? values[canonicalDisplay] : hydrated[canonicalDisplay];
          if (hasMeaningfulValue(currentValue)) return;
          const displayLookup =
            wrapperKeyMap[displayField.toLowerCase()] ||
            wrapperKeyMap[canonicalDisplay.toLowerCase()] ||
            wrapperKeyMap.label ||
            wrapperKeyMap.name ||
            wrapperKeyMap.title ||
            wrapperKeyMap.text;
          if (displayLookup !== undefined) {
            ensureHydrated();
            hydrated[canonicalDisplay] = displayLookup;
          }
        });
      });

      Object.entries(hydrated).forEach(([key, val]) => {
        if (Array.isArray(val)) {
          const mapped = val.map((item) => {
            if (!item || typeof item !== 'object') return item;
            return hydrateDisplayFromWrappedRelations(item, seen);
          });
          const hasChanges = mapped.some((item, idx) => !Object.is(item, val[idx]));
          if (hasChanges) {
            ensureHydrated();
            hydrated[key] = mapped;
          }
        } else if (val && typeof val === 'object') {
          const nested = hydrateDisplayFromWrappedRelations(val, seen);
          if (!Object.is(nested, val)) {
            ensureHydrated();
            hydrated[key] = nested;
          }
        }
      });

      return hydrated;
    },
    [relationConfigs, resolveCanonicalKey],
  );

  const resolveRelationDisplayValue = useCallback(
    function resolveRelationDisplayValue(row, displayField, config, rowKeyMap) {
      if (!row || typeof displayField !== 'string' || displayField.trim().length === 0)
        return undefined;
      const keyMap = rowKeyMap
        ? rowKeyMap
        : Object.keys(row || {}).reduce((acc, key) => {
            acc[key.toLowerCase()] = key;
            return acc;
          }, {});
      const lookupKey = keyMap[displayField.toLowerCase()];
      if (!lookupKey) return undefined;
      let displayValue = row[lookupKey];
      if (displayValue === undefined || displayValue === null) return undefined;
      const nestedLookup = config?.nestedLookups?.[displayField.toLowerCase()];
      if (nestedLookup) {
        const mapped =
          nestedLookup[displayValue] !== undefined
            ? nestedLookup[displayValue]
            : nestedLookup[String(displayValue)];
        if (mapped !== undefined) {
          displayValue = mapped;
        }
      }
      return displayValue;
    },
    [],
  );

  const populateRelationDisplayFields = useCallback(
    function populateRelationDisplayFields(values, seen = new WeakSet()) {
      if (!values || typeof values !== 'object') return values || {};

      const hasMeaningfulValue = (val) => {
        if (val === undefined || val === null) return false;
        if (typeof val === 'string') return val.trim().length > 0;
        return true;
      };

      const matchesCombinationRow = (row, sourceValue, combinationTargetColumn) => {
        if (!combinationTargetColumn) return true;
        if (sourceValue === undefined || sourceValue === null) return false;
        if (!row || typeof row !== 'object') return false;
        const rowKeyMap = {};
        Object.keys(row).forEach((k) => {
          rowKeyMap[k.toLowerCase()] = k;
        });
        const targetKey =
          rowKeyMap[combinationTargetColumn.toLowerCase()] || combinationTargetColumn;
        if (!targetKey) return false;
        const targetValue = row[targetKey];
        return (
          targetValue !== undefined &&
          targetValue !== null &&
          String(targetValue).trim() === String(sourceValue).trim()
        );
      };

      const getCombinationSourceValue = (config) => {
        if (!config?.combinationSourceColumn) return undefined;
        const canonicalSource = resolveCanonicalKey(config.combinationSourceColumn);
        if (!canonicalSource) return undefined;
        return hydrated === values ? values[canonicalSource] : hydrated[canonicalSource];
      };

      const getRelationOption = (fieldKey, value, config, sourceValue) => {
        if (value === undefined || value === null) return null;
        const relationId = resolveScopeId(value);
        const options =
          refData[fieldKey] || refData[resolveCanonicalKey(fieldKey)] || [];
        if (!Array.isArray(options)) return null;
        return (
          options.find((opt) => {
            if (
              !opt ||
              !(
                opt.value === relationId ||
                (relationId !== undefined &&
                  relationId !== null &&
                  String(opt.value) === String(relationId))
              )
            ) {
              return false;
            }
            if (!config?.combinationTargetColumn) return true;
            const row = getRelationRow(fieldKey, opt.value, config, sourceValue);
            return matchesCombinationRow(row, sourceValue, config.combinationTargetColumn);
          }) || null
        );
      };

      const getRelationRow = (fieldKey, value, config, sourceValue) => {
        if (value === undefined || value === null) return null;
        const relationId = resolveScopeId(value);
        const map = refRows[fieldKey] || refRows[resolveCanonicalKey(fieldKey)];
        if (!map || typeof map !== 'object') return null;
        const tryKeys = [];
        if (relationId !== undefined && relationId !== null) {
          tryKeys.push(relationId);
          const strRelationId = String(relationId).trim();
          if (strRelationId) tryKeys.push(strRelationId);
          const normalizedKey = normalizeRelationKey(strRelationId);
          if (normalizedKey) tryKeys.push(normalizedKey);
        }
        for (const key of tryKeys) {
          if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
          const candidate = map[key];
          if (
            matchesCombinationRow(
              candidate,
              sourceValue,
              config?.combinationTargetColumn || config?.combination_target_column,
            )
          ) {
            return candidate;
          }
        }
        return null;
      };

      let hydrated = values;
      const ensureHydrated = () => {
        if (hydrated === values) {
          hydrated = { ...values };
        }
      };

      Object.entries(relationConfigs || {}).forEach(([rawField, config]) => {
        if (!config || !Array.isArray(config.displayFields) || config.displayFields.length === 0) {
          return;
        }
        const canonicalField = resolveCanonicalKey(rawField);
        if (!canonicalField) return;
        const combinationSourceValue = getCombinationSourceValue(config);
        const relationValue =
          hydrated === values ? values[canonicalField] : hydrated[canonicalField];
        if (!hasMeaningfulValue(relationValue)) return;
        const relationRow = getRelationRow(
          canonicalField,
          relationValue,
          config,
          combinationSourceValue,
        );
        const relationOption = getRelationOption(
          canonicalField,
          relationValue,
          config,
          combinationSourceValue,
        );
        if (!relationRow && !relationOption) return;
        const rowKeyMap = {};
        Object.keys(relationRow || {}).forEach((key) => {
          rowKeyMap[key.toLowerCase()] = key;
        });
        config.displayFields.forEach((displayField) => {
          if (typeof displayField !== 'string' || !displayField.trim()) return;
          const canonicalDisplay = resolveCanonicalKey(displayField);
          if (!canonicalDisplay) return;
          const currentValue =
            hydrated === values ? values[canonicalDisplay] : hydrated[canonicalDisplay];
          if (hasMeaningfulValue(currentValue)) return;
          const displayValue = resolveRelationDisplayValue(
            relationRow,
            displayField,
            config,
            rowKeyMap,
          );
          const fallbackLabel = relationOption?.label;
          if (!hasMeaningfulValue(displayValue) && !hasMeaningfulValue(fallbackLabel)) {
            return;
          }
          ensureHydrated();
          hydrated[canonicalDisplay] =
            hasMeaningfulValue(displayValue) && displayValue !== relationValue
              ? displayValue
              : fallbackLabel ?? displayValue;
        });
      });

      Object.entries(hydrated).forEach(([key, val]) => {
        if (Array.isArray(val)) {
          const mapped = val.map((item) => {
            if (!item || typeof item !== 'object') return item;
            if (seen.has(item)) return item;
            seen.add(item);
            return populateRelationDisplayFields(item, seen);
          });
          const hasChanges = mapped.some((item, idx) => !Object.is(item, val[idx]));
          if (hasChanges) {
            ensureHydrated();
            hydrated[key] = mapped;
          }
        } else if (val && typeof val === 'object') {
          if (seen.has(val)) return;
          seen.add(val);
          const nested = populateRelationDisplayFields(val, seen);
          if (!Object.is(nested, val)) {
            ensureHydrated();
            hydrated[key] = nested;
          }
        }
      });

      return hydrated;
    },
    [
      refData,
      refRows,
      relationConfigs,
      resolveCanonicalKey,
      resolveRelationDisplayValue,
    ],
  );

  const mergeDisplayFallbacks = useCallback(
    function mergeDisplayFallbacks(primary, fallback, seen = new WeakSet()) {
      const hasMeaningfulValue = (val) => {
        if (val === undefined || val === null) return false;
        if (typeof val === 'string') return val.trim().length > 0;
        return true;
      };

      if (primary === fallback) return primary;
      if (!fallback || typeof fallback !== 'object') {
        return primary ?? fallback;
      }
      if (fallback instanceof Date) return primary ?? fallback;
      if (typeof File !== 'undefined' && fallback instanceof File) return primary;
      if (typeof Blob !== 'undefined' && fallback instanceof Blob) return primary;

      if (Array.isArray(primary) || Array.isArray(fallback)) {
        const primaryArr = Array.isArray(primary) ? primary : [];
        const fallbackArr = Array.isArray(fallback) ? fallback : [];
        const maxLength = Math.max(primaryArr.length, fallbackArr.length);
        let merged = primaryArr;
        for (let i = 0; i < maxLength; i += 1) {
          const next = mergeDisplayFallbacks(primaryArr[i], fallbackArr[i], seen);
          if (!Object.is(next, primaryArr[i])) {
            if (merged === primaryArr) merged = [...primaryArr];
            merged[i] = next;
          }
        }
        return merged;
      }

      if (!primary || typeof primary !== 'object') {
        const hasDisplayMetadata =
          fallback &&
          typeof fallback === 'object' &&
          Object.entries(fallback).some(
            ([key, val]) => key !== 'value' && hasMeaningfulValue(val),
          );
        if (hasMeaningfulValue(primary)) {
          return hasDisplayMetadata ? fallback : primary;
        }
        return hasDisplayMetadata ? fallback : primary ?? fallback;
      }

      if (seen.has(fallback)) return primary;
      seen.add(fallback);

      let merged = primary;
      Object.entries(fallback).forEach(([key, fallbackVal]) => {
        const primaryVal = primary[key];
        if (!hasMeaningfulValue(primaryVal) && hasMeaningfulValue(fallbackVal)) {
          if (merged === primary) merged = { ...primary };
          merged[key] = fallbackVal;
          return;
        }
        if (
          primaryVal &&
          typeof primaryVal === 'object' &&
          fallbackVal &&
          typeof fallbackVal === 'object'
        ) {
          const nested = mergeDisplayFallbacks(primaryVal, fallbackVal, seen);
          if (!Object.is(nested, primaryVal)) {
            if (merged === primary) merged = { ...primary };
            merged[key] = nested;
          }
        }
      });

      return merged;
    },
    [],
  );


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
            const displayValue = resolveRelationDisplayValue(row, df, conf, rowKeyMap);
            if (key && displayValue !== undefined) {
              next[key] = displayValue;
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

  async function issueTransactionEbarimt(recordId) {
    if (!posApiEnabled) return null;
    if (recordId === undefined || recordId === null || `${recordId}`.trim() === '') {
      addToast(
        t(
          'ebarimt_missing_id',
          'Unable to issue Ebarimt: missing transaction identifier.',
        ),
        'error',
      );
      return null;
    }
    if (!formName) {
      addToast(
        t(
          'ebarimt_missing_form',
          'Unable to issue Ebarimt: form name is not configured.',
        ),
        'error',
      );
      return null;
    }
    try {
      const res = await fetch('/api/transaction_ebarimt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ table, formName, recordId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast(t('ebarimt_post_success', 'Posted & Ebarimt issued'), 'success');
        if (ebarimtToastEnabled && data?.posApi) {
          if (Object.prototype.hasOwnProperty.call(data.posApi, 'payload')) {
            addToast(
              t('ebarimt_request_payload', 'POSAPI request: {{payload}}', {
                payload: formatTxnToastPayload(data.posApi.payload),
              }),
              'info',
            );
          }
          if (Object.prototype.hasOwnProperty.call(data.posApi, 'response')) {
            addToast(
              t('ebarimt_response_payload', 'POSAPI response: {{payload}}', {
                payload: formatTxnToastPayload(data.posApi.response),
              }),
              'info',
            );
          }
        }
        return data;
      }
      const errData = await res.json().catch(() => ({}));
      const message = errData?.message || res.statusText;
      addToast(
        t('ebarimt_post_failed', 'Ebarimt post failed: {{message}}', { message }),
        'error',
      );
      return null;
    } catch (err) {
      addToast(
        t('ebarimt_post_failed', 'Ebarimt post failed: {{message}}', {
          message: err.message,
        }),
        'error',
      );
      return null;
    }
  }

  const renameTransactionImages = useCallback(
    async ({ tableName, oldName, newName, folder, sourceFolder } = {}) => {
      if (!tableName || !oldName || !newName) return;
      const params = new URLSearchParams();
      if (folder) params.set('folder', folder);
      if (sourceFolder) params.set('sourceFolder', sourceFolder);
      const renameUrl =
        `${API_BASE}/transaction_images/${encodeURIComponent(tableName)}` +
        `/${encodeURIComponent(oldName)}/rename/${encodeURIComponent(newName)}` +
        `?${params.toString()}`;
      try {
        await fetch(renameUrl, { method: 'POST', credentials: 'include' });
      } catch (err) {
        console.error('Failed to rename transaction images', err);
      }
    },
    [],
  );

  async function handleSubmit(values, options = {}) {
    const { issueEbarimt = false, submitIntent = 'post' } = options || {};
    const normalizedSubmitIntent = submitIntent === 'ebarimt' ? 'post' : submitIntent;
    if (requestType !== 'temporary-promote' && !canPostTransactions) {
      addToast(
        t(
          'temporary_post_not_allowed',
          'You do not have permission to post this transaction.',
        ),
        'error',
      );
      return false;
    }
    const {
      forcePostFromTemporary,
      forwardingExistingTemporary,
      promoteAsTemporary,
      shouldForcePromote,
    } = computeTemporaryPromotionOptions({
      requestType,
      submitIntent: normalizedSubmitIntent,
      pendingPromotionHasSeniorAbove,
      pendingTemporaryPromotionId: pendingTemporaryPromotion?.id ?? null,
      canPostTransactions,
      forceResolvePendingDrafts,
    });
    const columns = new Set(allColumns);
    const mergedSource = { ...(editing || {}) };
    Object.entries(values).forEach(([k, v]) => {
      mergedSource[k] = v;
    });
    const merged = stripTemporaryLabelValue(mergedSource);

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
    const imageConfig = formConfig || {};
    const oldImageName = resolveImageNameForRow(
      baseRowForName || merged,
      imageConfig,
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
    const skipFields = new Set([...autoCols, ...generatedCols, 'id', 'rows']);
    const hasColumnMeta = validCols.size > 0;
    Object.entries(merged).forEach(([k, v]) => {
      const lower = k.toLowerCase();
      const canonicalKey = resolveCanonicalKey(k);
      const targetKey = canonicalKey || k;
      if (
        skipFields.has(k) ||
        skipFields.has(lower) ||
        skipFields.has(targetKey) ||
        k.startsWith('_')
      )
        return;
      if (hasColumnMeta && (!targetKey || !validCols.has(targetKey))) return;
      if (auditFieldSet.has(lower) && !(editSet?.has(lower))) return;
      if (v !== '') {
        const placeholderKey =
          placeholders[targetKey] !== undefined
            ? targetKey
            : placeholders[k] !== undefined
            ? k
            : null;
        const normalizedPlaceholder =
          placeholderKey !== null ? placeholders[placeholderKey] : undefined;
        cleaned[targetKey] =
          typeof v === 'string' ? normalizeDateInput(v, normalizedPlaceholder) : v;
      }
    });
    delete cleaned.rows;
    delete cleaned.Rows;

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
          setActiveTemporaryDraftId(null);
          resetWorkflowState();
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

    if (requestType === 'temporary-promote') {
      const temporaryId = pendingTemporaryPromotion?.id;
      if (!temporaryId) {
        addToast(
          t('temporary_promote_missing', 'Unable to promote temporary submission'),
          'error',
        );
        return false;
      }
      const promotionEntry = pendingTemporaryPromotion?.entry || null;
      const promotionEntryValues = promotionEntry
        ? buildTemporaryFormState(promotionEntry).values
        : null;
      const promotionValues =
        promotionEntryValues && promotionKeepFields.length > 0
          ? promotionKeepFields.reduce((acc, field) => {
              if (Object.prototype.hasOwnProperty.call(promotionEntryValues, field)) {
                acc[field] = promotionEntryValues[field];
              }
              return acc;
            }, { ...cleaned })
          : cleaned;
      const promotionConfig = getImageConfigForRow(promotionValues, formConfig || {});
      const promotionOldName = resolveImageNameWithFallback(
        promotionEntryValues,
        promotionConfig,
      );
      const promotionOldFolder = promotionEntryValues
        ? getImageFolder(promotionEntryValues)
        : null;
      const promotionNewFolder = getImageFolder(promotionValues);
      const promotionTable =
        promotionEntry?.tableName || promotionEntry?.table_name || table;
      if (txnToastEnabled) {
        const promoteRequestPayload = {
          cleanedValues: promotionValues,
          promoteAsTemporary,
          forcePromote: shouldForcePromote,
        };
        addToast(
          `Transaction toast: Promote POST request ${formatTxnToastPayload({
            url: `${API_BASE}/transaction_temporaries/${encodeURIComponent(temporaryId)}/promote`,
            method: 'POST',
            table: promotionTable,
            temporaryId,
            submitIntent: normalizedSubmitIntent,
            requestType,
            payload: promoteRequestPayload,
            canPostTransactions,
            forceResolvePendingDrafts,
          })}`,
          'info',
        );
        const insertSql = buildTxnInsertSql(promotionTable, promotionValues);
        if (insertSql) {
          addToast(
            `Transaction toast: Promote SQL insert ${formatTxnToastPayload(insertSql)}`,
            'info',
          );
        }
      }
      const ok = await promoteTemporary(temporaryId, {
        skipConfirm: true,
        silent: false,
        overrideValues: promotionValues,
        promoteAsTemporary,
        forcePromote: shouldForcePromote,
      });
      if (ok) {
        const promotedData = ok === true ? null : ok;
        if (txnToastEnabled) {
          addToast(
            `Transaction toast: Promote response ${formatTxnToastPayload({
              promotedData,
              promotedRecordId:
                promotedData?.promotedRecordId ||
                promotedData?.promoted_record_id ||
                promotedData?.recordId ||
                promotedData?.record_id ||
                promotedData?.id ||
                null,
              warnings: promotedData?.warnings,
            })}`,
            'info',
          );
        }
        const promotedRecordId =
          promotedData?.promotedRecordId ||
          promotedData?.promoted_record_id ||
          promotedData?.recordId ||
          promotedData?.record_id ||
          promotedData?.id ||
          null;
        const promotionNameSource =
          promotedRecordId &&
          promotionConfig?.imageIdField &&
          (promotionValues[promotionConfig.imageIdField] == null ||
            promotionValues[promotionConfig.imageIdField] === '')
            ? {
                ...promotionValues,
                [promotionConfig.imageIdField]: promotedRecordId,
              }
            : promotionValues;
        const promotionNewName = resolveImageNameWithFallback(
          promotionNameSource,
          promotionConfig,
        );
        const shouldRenamePromotionImages =
          Boolean(promotionOldName) &&
          Boolean(promotionNewName) &&
          (promotionOldName !== promotionNewName ||
            promotionOldFolder !== promotionNewFolder);
        if (shouldRenamePromotionImages) {
          await renameTransactionImages({
            tableName: promotionTable,
            oldName: promotionOldName,
            newName: promotionNewName,
            folder: promotionNewFolder,
            sourceFolder: promotionOldFolder,
          });
        }
        const resolvedPrintFormVals = {
          ...(promotionEntryValues || {}),
          ...promotionValues,
          ...(promotedData && typeof promotedData === 'object' ? promotedData : {}),
        };
        if (
          promotedRecordId !== null &&
          promotedRecordId !== undefined &&
          !Object.prototype.hasOwnProperty.call(resolvedPrintFormVals, 'id')
        ) {
          resolvedPrintFormVals.id = promotedRecordId;
        }
        const printPayload = {
          formVals: resolvedPrintFormVals,
          gridRows: Array.isArray(gridRows)
            ? gridRows.map((row) => ({ ...row }))
            : [],
        };
        openPrintModalForPayload(printPayload);
        const [nextEntry, ...remainingQueue] = temporaryPromotionQueue;
        setTemporaryPromotionQueue(remainingQueue);
        setTemporarySelection((prev) => {
          if (!prev || prev.size === 0 || !prev.has(temporaryId)) return prev;
          const next = new Set(prev);
          next.delete(temporaryId);
          return next;
        });
        setShowForm(false);
        setEditing(null);
        setIsAdding(false);
        setGridRows([]);
        setRequestType(null);
        setPendingTemporaryPromotion(null);
        setActiveTemporaryDraftId(null);
        setForceResolvePendingDrafts(false);
        resetWorkflowState();
        if (nextEntry) {
          setTimeout(() => {
            openTemporaryPromotion(nextEntry, { resetQueue: false });
          }, 0);
        }
        return { printPayload, forcePrint: true };
      }
      return ok;
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

    const editingRowId = isAdding ? null : getRowId(editing);
    let didOptimisticUpdate = false;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cleaned),
      });
      const savedRow = res.ok ? await res.json().catch(() => ({})) : {};
      const savedRowHasData =
        savedRow && typeof savedRow === 'object' && Object.keys(savedRow).length > 0;
      const normalizedSavedRow = savedRowHasData
        ? normalizeToCanonical(savedRow)
        : null;
      if (res.ok) {
        const msg = isAdding
          ? t('transaction_posted', 'Transaction posted')
          : t('transaction_updated', 'Transaction updated');
        const targetRecordId = isAdding
          ? savedRow?.id ?? normalizedSavedRow?.id ?? null
          : getRowId(editing);
        const shouldIssueEbarimt =
          submitIntent === 'ebarimt' && issueEbarimt && posApiEnabled;
        if (!isAdding && editingRowId !== null && editingRowId !== undefined) {
          const mergedRow = {
            ...editing,
            ...cleaned,
            ...(savedRowHasData ? normalizedSavedRow : {}),
          };
          if (!Object.prototype.hasOwnProperty.call(mergedRow, 'id')) {
            mergedRow.id = editingRowId;
          }
          setRows((prev) =>
            prev.map((row) =>
              getRowId(row) === editingRowId ? { ...row, ...mergedRow } : row,
            ),
          );
          didOptimisticUpdate = true;
        }
        setShowForm(false);
        setEditing(null);
        setIsAdding(false);
        setGridRows([]);
        setRequestType(null);
        setPendingTemporaryPromotion(null);
        resetWorkflowState();
        if (activeTemporaryDraftId) {
          await cleanupActiveTemporaryDraft();
        } else {
          setActiveTemporaryDraftId(null);
        }
        if (
          isAdding &&
          (((formConfig?.imagenameField || []).length > 0 ||
            Boolean(formConfig?.imageIdField)) ||
            oldImageName)
        ) {
          const rowForName = {
            ...merged,
            ...(savedRow && typeof savedRow === 'object' ? savedRow : {}),
          };
          const newImageName = resolveImageNameForRow(rowForName, imageConfig);
          const folder = getImageFolder(rowForName);
          const sourceFolder = getImageFolder(baseRowForName || merged);
          if (
            oldImageName &&
            newImageName &&
            (oldImageName !== newImageName || folder !== table)
          ) {
            await renameTransactionImages({
              tableName: table,
              oldName: oldImageName,
              newName: newImageName,
              folder,
              sourceFolder,
            });
          }
        }
        if (shouldIssueEbarimt) {
          try {
            await issueTransactionEbarimt(targetRecordId);
          } catch (err) {
            const detailParts = [];
            const missingEnv = Array.isArray(err.details?.missingEnvVars)
              ? err.details.missingEnvVars
              : [];
            if (missingEnv.length) {
              detailParts.push(`missing config: ${missingEnv.join(', ')}`);
            }
            const missingMapping = Array.isArray(err.details?.missingMapping)
              ? err.details.missingMapping
              : [];
            if (missingMapping.length) {
              detailParts.push(`missing mapping: ${missingMapping.join(', ')}`);
            }
            if (err.details?.field && err.details?.column) {
              detailParts.push(`${err.details.field} (column ${err.details.column})`);
            }
            const detailSuffix = detailParts.length ? ` (${detailParts.join('; ')})` : '';
            addToast(
              t('ebarimt_post_failed', 'Ebarimt post failed: {{message}}', {
                message: `${err.message}${detailSuffix}`,
              }),
              'error',
            );
          }
        }
        const resolvedPrintFormVals = {
          ...merged,
          ...(savedRowHasData ? normalizedSavedRow : {}),
        };
        if (
          targetRecordId !== null &&
          targetRecordId !== undefined &&
          !Object.prototype.hasOwnProperty.call(resolvedPrintFormVals, 'id')
        ) {
          resolvedPrintFormVals.id = targetRecordId;
        }
        const printPayload = {
          formVals: resolvedPrintFormVals,
          gridRows: Array.isArray(gridRows)
            ? gridRows.map((row) => ({ ...row }))
            : [],
        };
        addToast(msg, 'success');
        if (isAdding || !didOptimisticUpdate) {
          refreshRows();
        }
        if (isAdding) {
          setTimeout(() => openAdd(), 0);
        }
        return { printPayload };
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
    if (!canSaveTemporaryDraft) return false;
    if (!submission || typeof submission !== 'object') return false;
    const { forwardingExistingTemporary } = computeTemporaryPromotionOptions({
      requestType,
      submitIntent: 'temporary',
      pendingPromotionHasSeniorAbove,
      pendingTemporaryPromotionId: pendingTemporaryPromotion?.id ?? null,
      canPostTransactions,
      forceResolvePendingDrafts,
    });
    const cloneValue = (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      try {
        return typeof structuredClone === 'function'
          ? structuredClone(value)
          : JSON.parse(JSON.stringify(value));
      } catch {
        return value;
      }
    };
    const extractTemporaryPayload = (entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const payload =
        entry.payload && typeof entry.payload === 'object' ? cloneValue(entry.payload) : null;
      const values =
        cloneValue(payload?.values) ||
        cloneValue(entry.cleanedValues) ||
        cloneValue(entry.values) ||
        cloneValue(entry.rawValues) ||
        {};
      const cleanedValues =
        cloneValue(entry.cleanedValues) ||
        cloneValue(payload?.cleanedValues) ||
        cloneValue(values) ||
        {};
      const rawValues =
        cloneValue(entry.rawValues) ||
        cloneValue(payload?.rawValues) ||
        (values ? cloneValue(values) : null);
      const gridRows =
        cloneValue(payload?.gridRows) ||
        (Array.isArray(values?.rows) ? cloneValue(values.rows) : null);
      const rawRows =
        cloneValue(payload?.rawRows) ||
        (rawValues && Array.isArray(rawValues.rows) ? cloneValue(rawValues.rows) : null);
      return {
        payload: payload || null,
        values: values || {},
        cleanedValues,
        rawValues,
        gridRows,
        rawRows,
      };
    };
    const fetchTemporaryRecord = async (id) => {
      if (!id) return null;
      try {
        const res = await fetch(
          `${API_BASE}/transaction_temporaries/${encodeURIComponent(id)}`,
          { credentials: 'include' },
        );
        const rateLimitMessage = await getRateLimitMessage(res);
        if (rateLimitMessage) {
          addToast(rateLimitMessage, 'warning');
          return null;
        }
        if (!res.ok) return null;
        const data = await res.json().catch(() => ({}));
        return data?.row || data || null;
      } catch (err) {
        console.error('Failed to load original temporary record', err);
        return null;
      }
    };

    const normalizeChainId = (value) => {
      if (value === undefined || value === null) return null;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      const str = String(value).trim();
      return str ? str : null;
    };
    const valueSource =
      submission.values && typeof submission.values === 'object'
        ? submission.values
        : submission;
    let normalizedValues =
      valueSource && typeof valueSource === 'object' && !Array.isArray(valueSource)
        ? stripTemporaryLabelValue(valueSource)
        : {};
    let rawOverride =
      submission.rawValues && typeof submission.rawValues === 'object'
        ? stripTemporaryLabelValue(submission.rawValues)
        : null;
    const gridRowsSource = Array.isArray(submission.normalizedRows)
      ? submission.normalizedRows
      : Array.isArray(valueSource?.rows)
      ? valueSource.rows
      : null;
    let gridRows = Array.isArray(gridRowsSource)
      ? stripTemporaryLabelValue(gridRowsSource)
      : null;
    let rawRows =
      submission.rawRows && typeof submission.rawRows === 'object'
        ? stripTemporaryLabelValue(submission.rawRows)
        : null;
    const mergedSource = { ...(editing || {}) };

    const nextSeniorEmpIds = normalizePlanSeniorList(session?.senior_plan_empid);
    const nextSeniorEmpId = nextSeniorEmpIds[0] || null;
    const nextSeniorEmpValue =
      nextSeniorEmpIds.length > 1 ? JSON.stringify(nextSeniorEmpIds) : nextSeniorEmpId;
    const isReviewForwarding =
      forwardingExistingTemporary && canReviewTemporary && temporaryScope === 'review';

    let preservedPayload = null;
    if (isReviewForwarding && pendingTemporaryPromotion?.id) {
      const preservedTemporary =
        (await fetchTemporaryRecord(pendingTemporaryPromotion.id)) ||
        pendingTemporaryPromotion?.entry ||
        null;
      preservedPayload = extractTemporaryPayload(preservedTemporary);
    }

    if (preservedPayload) {
      normalizedValues = preservedPayload.values || {};
      rawOverride = preservedPayload.rawValues || rawOverride;
      gridRows = preservedPayload.gridRows ?? gridRows;
      rawRows = preservedPayload.rawRows ?? rawRows;
    }

    Object.entries(normalizedValues).forEach(([k, v]) => {
      mergedSource[k] = v;
    });
    if (!preservedPayload) {
      Object.entries(formConfig?.defaultValues || {}).forEach(([k, v]) => {
        if (mergedSource[k] === undefined || mergedSource[k] === '') {
          mergedSource[k] = stripTemporaryLabelValue(v);
        }
      });
    }

    if (isAdding && autoFillSession && !preservedPayload) {
      const columns = new Set(allColumns);
      userIdFields.forEach((f) => {
        if (columns.has(f)) mergedSource[f] = user?.empid;
      });
      branchIdFields.forEach((f) => {
        if (columns.has(f) && branch !== undefined) mergedSource[f] = branch;
      });
      departmentIdFields.forEach((f) => {
        if (columns.has(f) && department !== undefined) mergedSource[f] = department;
      });
      companyIdFields.forEach((f) => {
        if (columns.has(f) && company !== undefined) mergedSource[f] = company;
      });
    }

    if (forwardingExistingTemporary && nextSeniorEmpIds.length > 0 && !preservedPayload) {
      ['plan_senior_empid', 'plan_senior_emp_id', 'planSeniorEmpId', 'planSeniorEmpID'].forEach(
        (key) => {
          mergedSource[key] = nextSeniorEmpValue;
        },
      );
    }

    const merged = stripTemporaryLabelValue(mergedSource);
    let cleaned = preservedPayload
      ? cloneValue(preservedPayload.cleanedValues || preservedPayload.values || {})
      : {};
    const skipFields = new Set([...autoCols, ...generatedCols, 'id', 'rows']);
    const hasColumnMeta = validCols.size > 0;
    if (!preservedPayload) {
      Object.entries(merged).forEach(([k, v]) => {
        const lower = k.toLowerCase();
        const canonicalKey = resolveCanonicalKey(k);
        const targetKey = canonicalKey || k;
        if (
          skipFields.has(k) ||
          skipFields.has(lower) ||
          skipFields.has(targetKey) ||
          k.startsWith('_')
        )
          return;
        if (hasColumnMeta && (!targetKey || !validCols.has(targetKey))) return;
        if (auditFieldSet.has(lower) && !(editSet?.has(lower))) return;
        if (v !== '') {
          const placeholderKey =
            placeholders[targetKey] !== undefined
              ? targetKey
              : placeholders[k] !== undefined
              ? k
              : null;
          const normalizedPlaceholder =
            placeholderKey !== null ? placeholders[placeholderKey] : undefined;
          cleaned[targetKey] =
            typeof v === 'string' ? normalizeDateInput(v, normalizedPlaceholder) : v;
        }
      });
    }

    const headerNormalizedValues = { ...normalizedValues };
    if (gridRows && 'rows' in headerNormalizedValues) {
      delete headerNormalizedValues.rows;
    }

    const headerRawValues = rawOverride ? { ...rawOverride } : { ...merged };
    if (Array.isArray(headerRawValues?.rows)) {
      delete headerRawValues.rows;
    }

    const submittedAt = new Date().toISOString();
    const baseTenant = {
      company_id: company ?? null,
    };
    const promotionChainId = normalizeChainId(
      pendingTemporaryPromotion?.entry?.chainId ??
        pendingTemporaryPromotion?.entry?.chain_id ??
        getTemporaryId(pendingTemporaryPromotion?.entry),
    );
    const resolvedChainId =
      normalizeChainId(submission.chainId ?? submission.chain_id) ||
      normalizeChainId(editing?.chainId ?? editing?.chain_id) ||
      promotionChainId ||
      null;
    const baseRequest = {
      table,
      formName: formName || formConfig?.moduleLabel || null,
      configName: formName || null,
      moduleKey: formConfig?.moduleKey || null,
      tenant: baseTenant,
      ...(resolvedChainId ? { chainId: resolvedChainId } : {}),
    };

    if (forwardingExistingTemporary) {
      const promoted = await promoteTemporary(pendingTemporaryPromotion.id, {
        skipConfirm: true,
        silent: false,
        overrideValues: isReviewForwarding ? null : cleaned,
        promoteAsTemporary: true,
      });
      if (!promoted) {
        return false;
      }
    }

    const rowsToProcess =
      preservedPayload && isReviewForwarding
        ? [null]
        : gridRows && gridRows.length > 0
        ? gridRows
        : [null];
    const rawRowList = Array.isArray(rawRows) ? rawRows : [];
    let successCount = 0;
    let failureCount = 0;

    for (let idx = 0; idx < rowsToProcess.length; idx += 1) {
      const row = rowsToProcess[idx];
      const rowRawSource = Array.isArray(rawRowList) ? rawRowList[idx] : null;
      const rowValues = row ? { ...headerNormalizedValues, ...row } : { ...normalizedValues };
      const rowCleaned =
        preservedPayload && isReviewForwarding && preservedPayload.cleanedValues
          ? cloneValue(preservedPayload.cleanedValues)
          : { ...cleaned };
      if (forwardingExistingTemporary && nextSeniorEmpIds.length > 0 && !preservedPayload) {
        ['plan_senior_empid', 'plan_senior_emp_id', 'planSeniorEmpId', 'planSeniorEmpID'].forEach(
          (key) => {
            rowValues[key] = nextSeniorEmpValue;
            rowCleaned[key] = nextSeniorEmpValue;
          },
        );
      }
      if (row && !(preservedPayload && isReviewForwarding)) {
        Object.entries(row).forEach(([k, v]) => {
          const lower = k.toLowerCase();
          const canonicalKey = resolveCanonicalKey(k);
          const targetKey = canonicalKey || k;
          if (
            skipFields.has(k) ||
            skipFields.has(lower) ||
            skipFields.has(targetKey) ||
            k.startsWith('_')
          )
            return;
          if (hasColumnMeta && (!targetKey || !validCols.has(targetKey))) return;
          if (auditFieldSet.has(lower) && !(editSet?.has(lower))) return;
          if (v !== '') {
            const placeholderKey =
              placeholders[targetKey] !== undefined
                ? targetKey
                : placeholders[k] !== undefined
                ? k
                : null;
            const normalizedPlaceholder =
              placeholderKey !== null ? placeholders[placeholderKey] : undefined;
            rowCleaned[targetKey] =
              typeof v === 'string' ? normalizeDateInput(v, normalizedPlaceholder) : v;
          }
        });
      }

      const rowPayload =
        preservedPayload && isReviewForwarding && preservedPayload.payload
          ? (() => {
              const clone = cloneValue(preservedPayload.payload) || {};
              if (!clone.values) {
                clone.values = cloneValue(normalizedValues);
              }
              if (!clone.submittedAt) {
                clone.submittedAt = submittedAt;
              }
              return clone;
            })()
          : {
              values: rowValues,
              submittedAt,
            };
      if (row && !(preservedPayload && isReviewForwarding)) {
        rowPayload.gridRows = [row];
        rowPayload.rowCount = 1;
        if (rowRawSource) {
          rowPayload.rawRows = [stripTemporaryLabelValue(rowRawSource)];
        }
      } else if (!row && rawRows && !Array.isArray(rawRows) && !rowPayload.rawRows) {
        rowPayload.rawRows = rawRows;
      }

      const rowRawValues =
        preservedPayload && isReviewForwarding
          ? cloneValue(
              rawOverride ||
                preservedPayload.payload?.rawValues ||
                preservedPayload.rawValues ||
                rowPayload.values ||
                merged,
            )
          : row
          ? (() => {
              const combined = { ...headerRawValues };
              const source =
                rowRawSource && typeof rowRawSource === 'object'
                  ? stripTemporaryLabelValue(rowRawSource)
                  : null;
              Object.entries(source || row || {}).forEach(([k, v]) => {
                combined[k] = v;
              });
              return combined;
            })()
          : rawOverride || merged;

      const body = {
        ...baseRequest,
        payload: rowPayload,
        rawValues: rowRawValues,
        cleanedValues:
          preservedPayload && isReviewForwarding && preservedPayload.cleanedValues
            ? cloneValue(preservedPayload.cleanedValues)
            : rowCleaned,
      };

      try {
        const res = await fetch(`${API_BASE}/transaction_temporaries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const rateLimitMessage = await getRateLimitMessage(res);
        if (rateLimitMessage) {
          addToast(rateLimitMessage, 'warning');
          failureCount += 1;
          break;
        }
        if (!res.ok) {
          let errorMessage = t('temporary_save_failed', 'Failed to save temporary draft');
          try {
            const data = await res.json();
            if (data?.message) {
              errorMessage = `${errorMessage}: ${data.message}`;
            }
          } catch {
            try {
              const text = await res.text();
              if (text) {
                errorMessage = `${errorMessage}: ${text}`;
              }
            } catch {}
          }
          if (rowsToProcess.length > 1) {
            errorMessage = `${errorMessage} (row ${idx + 1})`;
          }
          addToast(errorMessage, 'error');
          failureCount += 1;
          continue;
        }
        successCount += 1;
      } catch (err) {
        console.error('Temporary save failed', err);
        const baseMessage = t('temporary_save_failed', 'Failed to save temporary draft');
        addToast(
          rowsToProcess.length > 1
            ? `${baseMessage} (row ${idx + 1})`
            : baseMessage,
          'error',
        );
        failureCount += 1;
      }
    }

    if (successCount > 0) {
      const message =
        successCount > 1
          ? t('temporary_saved_multiple', 'Saved {{count}} temporary drafts', {
              count: successCount,
            })
          : t('temporary_saved', 'Saved as temporary draft');
      addToast(message, 'success');
      const backgroundTasks = [
        (async () => {
          try {
            await refreshTemporarySummary();
          } catch (err) {
            console.error('Failed to refresh temporary summary after save', err);
          }
        })(),
      ];
      if (activeTemporaryDraftId) {
        backgroundTasks.push(
          (async () => {
            try {
              await cleanupActiveTemporaryDraft();
            } catch (err) {
              console.error('Failed to cleanup temporary draft after save', err);
            }
          })(),
        );
      }
      if (failureCount === 0) {
        setShowForm(false);
        setEditing(null);
        setIsAdding(false);
        setGridRows([]);
        resetWorkflowState();
      }
      Promise.allSettled(backgroundTasks).catch((err) => {
        console.error('Unexpected error finishing temporary save tasks', err);
      });
    }

    return failureCount === 0 && successCount > 0;
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
    async (scopeOverride, options = {}) => {
      if (!supportsTemporary || availableTemporaryScopes.length === 0) return;
      const requestedScope = scopeOverride || temporaryScope;
      const targetScope = availableTemporaryScopes.includes(requestedScope)
        ? requestedScope
        : defaultTemporaryScope;
      if (!availableTemporaryScopes.includes(targetScope)) return;
      const preserveScope = Boolean(options?.preserveScope);
      const params = new URLSearchParams();
      params.set('scope', targetScope);
      const temporaryFormName = formName || formConfig?.formName || formConfig?.configName || '';
      const temporaryConfigName = formConfig?.configName || formName || '';
      if (temporaryFormName) {
        params.set('formName', temporaryFormName);
      }
      if (temporaryConfigName) {
        params.set('configName', temporaryConfigName);
      }
      const transactionTypeField = formConfig?.transactionTypeField || '';
      const normalizedTypeFilter = typeof typeFilter === 'string' ? typeFilter.trim() : typeFilter;
      if (transactionTypeField && normalizedTypeFilter) {
        params.set('transactionTypeField', transactionTypeField);
        params.set('transactionTypeValue', normalizedTypeFilter);
      }

      const requestedStatus =
        options?.status !== undefined
          ? options.status
          : targetScope === 'review'
          ? 'pending'
          : null;
      const statusValue =
        requestedStatus === null || requestedStatus === undefined
          ? ''
          : String(requestedStatus).trim();
      if (statusValue) {
        params.set('status', statusValue);
      }

      const shouldFilterByTable = (() => {
        if (options?.table !== undefined) {
          return Boolean(options.table);
        }
        return Boolean(table);
      })();

      if (shouldFilterByTable && table) {
        params.set('table', table);
      }
      const focusIdRaw = options?.focusId;
      const focusId =
        focusIdRaw !== undefined &&
        focusIdRaw !== null &&
        String(focusIdRaw).trim() !== ''
          ? String(focusIdRaw)
          : null;
      const runFetch = async (searchParams) => {
        const res = await fetch(
          `${API_BASE}/transaction_temporaries?${searchParams.toString()}`,
          { credentials: 'include' },
        );
        const rateLimitMessage = await getRateLimitMessage(res);
        if (rateLimitMessage) {
          const err = new Error(rateLimitMessage);
          err.rateLimited = true;
          throw err;
        }
        if (!res.ok) throw new Error('Failed to load temporaries');
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.rows) ? data.rows : [];
        return rows;
      };

      setTemporaryLoading(true);
      try {
        let rows = await runFetch(params);

        const shouldRetryWithoutStatus =
          targetScope === 'review' &&
          !options?.status &&
          (Number(temporarySummary?.reviewPending) || 0) > 0 &&
          rows.length === 0;

        if (shouldRetryWithoutStatus) {
          const retryParams = new URLSearchParams(params);
          retryParams.delete('status');
          try {
            rows = await runFetch(retryParams);
          } catch (retryErr) {
            console.error('Retrying temporaries without status failed', retryErr);
          }
        }

        let nextRows = rows;
        if (focusId) {
          const idx = rows.findIndex((item) => String(item?.id) === focusId);
          if (idx > 0) {
            const target = rows[idx];
            nextRows = [target, ...rows.slice(0, idx), ...rows.slice(idx + 1)];
          }
          if (!preserveScope || targetScope === temporaryScope) {
            setTemporaryFocusId(focusId);
          }
        } else if (!preserveScope || targetScope === temporaryScope) {
          setTemporaryFocusId(null);
        }
        if (!preserveScope || targetScope === temporaryScope) {
          if (!showFormRef.current) {
            setTemporaryScope(targetScope);
          }
          setTemporaryList(nextRows);
        }
      } catch (err) {
        console.error('Failed to load temporaries', err);
        if (err?.rateLimited) {
          addToast(err.message || rateLimitFallbackMessage, 'warning');
          return;
        }
        setTemporaryFocusId(null);
        setTemporaryList([]);
      } finally {
        setTemporaryLoading(false);
      }
    },
    [
      supportsTemporary,
      table,
      temporaryScope,
      availableTemporaryScopes,
      defaultTemporaryScope,
      temporarySummary,
      formName,
      formConfig?.formName,
      formConfig?.configName,
      formConfig?.transactionTypeField,
      typeFilter,
      addToast,
      getRateLimitMessage,
      rateLimitFallbackMessage,
    ],
  );

  const refreshTemporaryQueuesAfterDecision = useCallback(
    async ({ focusId = null } = {}) => {
      await refreshTemporarySummary();
      const scopesToRefresh = new Set(['review', 'created']);
      if (temporaryScope) scopesToRefresh.add(temporaryScope);
      for (const scope of scopesToRefresh) {
        if (!availableTemporaryScopes.includes(scope)) continue;
        await fetchTemporaryList(scope, {
          focusId: focusId || undefined,
          preserveScope: scope === temporaryScope,
        });
      }
    },
    [
      availableTemporaryScopes,
      fetchTemporaryList,
      refreshTemporarySummary,
      temporaryScope,
    ],
  );

  const closeTemporaryChainModal = useCallback(() => {
    setTemporaryChainModalVisible(false);
    setTemporaryChainModalData(null);
    setTemporaryChainModalError('');
  }, []);

  const openTemporaryChainModal = useCallback(
    async (entry) => {
      const id = getTemporaryId(entry);
      if (!id) {
        addToast(
          t(
            'temporary_chain_missing_id',
            'Unable to load review chain for this temporary record.',
          ),
          'error',
        );
        return;
      }
      setTemporaryChainModalVisible(true);
      setTemporaryChainModalLoading(true);
      setTemporaryChainModalError('');
      setTemporaryChainModalData(null);
      try {
        const res = await fetch(
          `${API_BASE}/transaction_temporaries/${encodeURIComponent(id)}/chain`,
          { credentials: 'include' },
        );
        const rateLimitMessage = await getRateLimitMessage(res);
        if (rateLimitMessage) {
          addToast(rateLimitMessage, 'warning');
          setTemporaryChainModalError(rateLimitMessage);
          return;
        }
        if (!res.ok) {
          let message = t(
            'temporary_chain_load_failed',
            'Failed to load review chain',
          );
          try {
            const data = await res.json();
            if (data?.message) message += `: ${data.message}`;
          } catch {
            // ignore
          }
          setTemporaryChainModalError(message);
          return;
        }
        const data = await res.json().catch(() => ({}));
        const chain = Array.isArray(data.chain) ? data.chain : [];
        const reviewHistory = Array.isArray(data.reviewHistory)
          ? data.reviewHistory
          : [];
        const chainId = data.chainId || chain[0]?.chainId || null;
        setTemporaryChainModalData({
          chain,
          reviewHistory,
          chainId,
          entryId: id,
          formLabel: entry?.formLabel || entry?.formName || '',
        });
      } catch (err) {
        console.error('Failed to load temporary chain', err);
        setTemporaryChainModalError(
          err?.message ||
            t('temporary_chain_load_failed', 'Failed to load review chain'),
        );
      } finally {
        setTemporaryChainModalLoading(false);
      }
    },
    [addToast, getRateLimitMessage, t],
  );

  async function cleanupActiveTemporaryDraft({ refreshList = true } = {}) {
    if (!activeTemporaryDraftId) return;
    const targetId = activeTemporaryDraftId;
    let shouldUpdateList = true;
    try {
      const res = await fetch(
        `${API_BASE}/transaction_temporaries/${encodeURIComponent(targetId)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      const rateLimitMessage = await getRateLimitMessage(res);
      if (rateLimitMessage) {
        addToast(rateLimitMessage, 'warning');
        shouldUpdateList = false;
      }
      if (!res.ok && res.status !== 404) {
        if (res.status === 409) {
          console.warn('Temporary submission was not rejected, skipping cleanup');
          shouldUpdateList = false;
        } else {
          let errorText = '';
          try {
            errorText = await res.text();
          } catch (readErr) {
            console.error('Failed to read temporary cleanup response', readErr);
          }
          console.error('Failed to remove rejected temporary submission', errorText);
          shouldUpdateList = false;
        }
      }
    } catch (err) {
      console.error('Failed to remove rejected temporary submission', err);
      shouldUpdateList = false;
    }
    if (shouldUpdateList) {
      setTemporaryList((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const target = String(targetId);
        const filtered = prev.filter((entry) => String(entry?.id ?? '') !== target);
        return filtered.length === prev.length ? prev : filtered;
      });
      if (refreshList) {
        try {
          await fetchTemporaryList(temporaryScope);
        } catch (err) {
          console.error('Failed to refresh temporary list after cleanup', err);
        }
      }
    }
    setActiveTemporaryDraftId(null);
  }

  useEffect(() => {
    if (!supportsTemporary || availableTemporaryScopes.length === 0) return;
    if (!queuedTemporaryTrigger || !queuedTemporaryTrigger.open) return;
    if (
      queuedTemporaryTrigger.table &&
      table &&
      String(queuedTemporaryTrigger.table).toLowerCase() !==
        String(table).toLowerCase()
    ) {
      return;
    }
    const triggerKey =
      queuedTemporaryTrigger.key ||
      JSON.stringify([
        queuedTemporaryTrigger.scope,
        queuedTemporaryTrigger.table,
        queuedTemporaryTrigger.id,
      ]);
    if (lastExternalTriggerRef.current === triggerKey) return;

    const requestedScope = queuedTemporaryTrigger.scope;
    let scopeToOpen;
    if (requestedScope && availableTemporaryScopes.includes(requestedScope)) {
      scopeToOpen = requestedScope;
    } else if (
      availableTemporaryScopes.includes('review') &&
      Number(temporarySummary?.reviewPending) > 0
    ) {
      scopeToOpen = 'review';
    } else if (availableTemporaryScopes.includes('created')) {
      scopeToOpen = 'created';
    } else {
      scopeToOpen = defaultTemporaryScope;
    }

    lastExternalTriggerRef.current = triggerKey;
    setTemporaryScope(scopeToOpen);
    setShowTemporaryModal(true);
    autoTemporaryLoadScopesRef.current.delete(scopeToOpen);
    const focusId =
      queuedTemporaryTrigger.id != null && queuedTemporaryTrigger.id !== ''
        ? queuedTemporaryTrigger.id
        : null;
    fetchTemporaryList(scopeToOpen, focusId ? { focusId } : undefined);
    if (typeof markTemporaryScopeSeen === 'function' && scopeToOpen) {
      markTemporaryScopeSeen(scopeToOpen);
    }
  }, [
    fetchTemporaryList,
    markTemporaryScopeSeen,
    queuedTemporaryTrigger,
    supportsTemporary,
    table,
    temporarySummary,
    availableTemporaryScopes,
    defaultTemporaryScope,
  ]);

  useEffect(() => {
    if (!showTemporaryModal) {
      autoTemporaryLoadScopesRef.current.clear();
      return;
    }
    if (
      !supportsTemporary ||
      availableTemporaryScopes.length === 0 ||
      temporaryLoading ||
      temporaryList.length > 0
    ) {
      return;
    }
    const attemptedScopes = autoTemporaryLoadScopesRef.current;
    if (attemptedScopes.has(temporaryScope)) return;
    attemptedScopes.add(temporaryScope);
    fetchTemporaryList(temporaryScope);
  }, [
    showTemporaryModal,
    supportsTemporary,
    availableTemporaryScopes,
    temporaryLoading,
    temporaryList.length,
    temporaryScope,
    fetchTemporaryList,
  ]);

  async function promoteTemporary(
    id,
    {
      skipConfirm = false,
      silent = false,
      overrideValues = null,
      promoteAsTemporary = false,
      forcePromote = false,
      forceRetry = false,
    } = {},
  ) {
    if (!canReviewTemporary) return false;
    if (
      !skipConfirm &&
      !window.confirm(t('promote_temporary_confirm', 'Promote temporary record?'))
    )
      return false;
    try {
      const payload =
        overrideValues && typeof overrideValues === 'object'
          ? stripTemporaryLabelValue(overrideValues)
          : null;
      const payloadWithForcePromote =
        payload || forcePromote
          ? { ...(payload || {}), ...(forcePromote ? { forcePromote: true } : {}) }
          : null;
      const hasPayload = payloadWithForcePromote && Object.keys(payloadWithForcePromote).length > 0;
      const requestBody =
        promoteAsTemporary || hasPayload || forcePromote
          ? {
              ...(hasPayload ? { cleanedValues: payloadWithForcePromote } : {}),
              promoteAsTemporary,
              ...(forcePromote ? { forcePromote: true } : {}),
            }
          : null;
      const res = await fetch(
        `${API_BASE}/transaction_temporaries/${encodeURIComponent(id)}/promote`,
        {
          method: 'POST',
          headers: requestBody ? { 'Content-Type': 'application/json' } : undefined,
          credentials: 'include',
          body: requestBody ? JSON.stringify(requestBody) : undefined,
        },
      );
      const rateLimitMessage = await getRateLimitMessage(res);
      if (rateLimitMessage) {
        addToast(rateLimitMessage, 'warning');
        return false;
      }
      let data = null;
      try {
        data = await res.json();
      } catch (err) {
        data = null;
      }
      if (!res.ok) {
        const message =
          data?.message ||
          data?.error ||
          t('temporary_promote_failed', 'Failed to promote temporary');
        const canForceResolveNow =
          !forcePromote &&
          !forceRetry &&
          showForceResolvePendingToggle &&
          res.status === 409 &&
          typeof message === 'string' &&
          message.toLowerCase().includes('another temporary submission in this chain is pending');
        if (canForceResolveNow) {
          const confirmForce = window.confirm(
            t(
              'temporary_force_resolve_confirm',
              'Another draft in this chain is pending. Resolve other pending drafts and continue?',
            ),
          );
          if (confirmForce) {
            setForceResolvePendingDrafts(true);
            return promoteTemporary(id, {
              skipConfirm: true,
              silent,
              overrideValues,
              promoteAsTemporary,
              forcePromote: true,
              forceRetry: true,
            });
          }
        }
        if (!silent) {
          addToast(message, 'error');
        }
        return false;
      }
      if (!silent) {
        addToast(t('temporary_promoted', 'Temporary promoted'), 'success');
        if (Array.isArray(data?.warnings) && data.warnings.length > 0) {
          const warningDetails = data.warnings
            .map((warn) => {
              if (!warn || !warn.column) return null;
              if (
                warn.type === 'maxLength' &&
                warn.actualLength != null &&
                warn.maxLength != null
              ) {
                return `${warn.column} (${warn.actualLength}→${warn.maxLength})`;
              }
              return warn.column;
            })
            .filter(Boolean)
            .join(', ');
          if (warningDetails) {
            addToast(
              t(
                'temporary_promoted_with_warnings',
                'Some fields were adjusted to fit length limits: {{details}}',
                { details: warningDetails },
              ),
              'warning',
            );
          }
        }
      }
      setTemporaryList((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const targetId = String(id);
        const filtered = prev.filter((entry) => getTemporaryId(entry) !== targetId);
        return filtered.length === prev.length ? prev : filtered;
      });
      await refreshTemporaryQueuesAfterDecision({ focusId: id });
      setLocalRefresh((r) => r + 1);
      return data || true;
    } catch (err) {
      console.error(err);
      if (!silent) {
        addToast(t('temporary_promote_failed', 'Failed to promote temporary'), 'error');
      }
      return false;
    }
  }

    const buildTemporaryFormState = useCallback(
      (entry) => {
        if (!entry) {
          return { values: {}, rows: [] };
        }

        const cleanedValueSources = [
          entry?.cleanedValues,
          entry?.payload?.cleanedValues,
        ];
        const rawValueSources = [
          entry?.payload?.values,
          entry?.values,
          entry?.rawValues,
        ];
        const cleanedValues = cleanedValueSources.find(
          (candidate) =>
            candidate && typeof candidate === 'object' && !Array.isArray(candidate),
        );
        const rawValues = rawValueSources.find(
          (candidate) =>
            candidate && typeof candidate === 'object' && !Array.isArray(candidate),
        );
        const baseValues = {
          ...(rawValues || {}),
          ...(cleanedValues || {}),
        };
        const hydratedValues = hydrateDisplayFromWrappedRelations(baseValues);
        const canonicalHydratedValues = normalizeToCanonical(hydratedValues);
        const normalizedValues = populateRelationDisplayFields(
          normalizeToCanonical(stripTemporaryLabelValue(hydratedValues)),
        );
        const mergedValues = mergeDisplayFallbacks(normalizedValues, canonicalHydratedValues);
        const finalizedValues = populateRelationDisplayFields(mergedValues);
        const promotedRecordId =
          entry?.promotedRecordId ||
          entry?.promoted_record_id ||
          entry?.recordId ||
          entry?.record_id ||
          null;
        const imageConfig =
          getConfigForRow({ ...finalizedValues, ...entry }) || formConfig || {};
        const resolvedImageValues = {
          ...finalizedValues,
          ...entry,
        };
        if (
          promotedRecordId &&
          imageConfig?.imageIdField &&
          (resolvedImageValues[imageConfig.imageIdField] == null ||
            resolvedImageValues[imageConfig.imageIdField] === '')
        ) {
          resolvedImageValues[imageConfig.imageIdField] = promotedRecordId;
          if (
            finalizedValues[imageConfig.imageIdField] == null ||
            finalizedValues[imageConfig.imageIdField] === ''
          ) {
            finalizedValues[imageConfig.imageIdField] = promotedRecordId;
          }
        }
        const existingTemporaryImageName =
          entry?._imageName || entry?.imageName || entry?.image_name || '';
        if (existingTemporaryImageName) {
          finalizedValues._imageName =
            finalizedValues._imageName || existingTemporaryImageName;
          finalizedValues.imageName =
            finalizedValues.imageName || existingTemporaryImageName;
          finalizedValues.image_name =
            finalizedValues.image_name || existingTemporaryImageName;
        }

        const rowSources = [
          entry?.payload?.gridRows,
          entry?.payload?.values?.rows,
          entry?.cleanedValues?.rows,
          entry?.values?.rows,
          entry?.rawValues?.rows,
        ];
        const baseRows = rowSources.find((rows) => Array.isArray(rows));
        const sanitizedRows = Array.isArray(baseRows)
          ? baseRows.map((row) => {
              const hydratedRow = hydrateDisplayFromWrappedRelations(row);
              const stripped = stripTemporaryLabelValue(hydratedRow);
              if (stripped && typeof stripped === 'object' && !Array.isArray(stripped)) {
                const canonical = normalizeToCanonical(stripped);
                const populated = populateRelationDisplayFields(canonical);
                const mergedRow = mergeDisplayFallbacks(
                  populated,
                  normalizeToCanonical(hydratedRow),
                );
                return populateRelationDisplayFields(mergedRow);
              }
              return stripped ?? {};
            })
          : [];

        return { values: finalizedValues, rows: sanitizedRows };
      },
      [
        formConfig,
        getConfigForRow,
        hydrateDisplayFromWrappedRelations,
        mergeDisplayFallbacks,
        normalizeToCanonical,
        populateRelationDisplayFields,
        resolveImageNameForRow,
      ],
    );

    const openTemporaryPromotion = useCallback(
      async (entry, { resetQueue = true } = {}) => {
        if (!entry) return;
        const temporaryId = getTemporaryId(entry);
        if (!temporaryId) return;
        if (resetQueue) {
          setTemporaryPromotionQueue([]);
        }
        await ensureColumnMeta();
          const { values: normalizedValues, rows: sanitizedRows } = buildTemporaryFormState(entry);

          setPendingTemporaryPromotion({ id: temporaryId, entry });
          setEditing(normalizedValues);
          setGridRows(sanitizedRows);
          setIsAdding(true);
          setRequestType('temporary-promote');
          setForceResolvePendingDrafts(false);
          setShowTemporaryModal(false);
          setShowForm(true);
        },
        [
          buildTemporaryFormState,
          ensureColumnMeta,
        setEditing,
        setGridRows,
        setIsAdding,
        setRequestType,
        setShowTemporaryModal,
      setShowForm,
      setTemporaryPromotionQueue,
    ],
  );

  useEffect(() => {
    if (!promotionHydrationNeededRef.current) return;
    if (requestType !== 'temporary-promote') return;
    if (!pendingTemporaryPromotion?.entry) return;
    if (!showForm) return;

    const hasRelations = relationConfigs && Object.keys(relationConfigs).length > 0;
    const hasRefRows = refRows && Object.keys(refRows).length > 0;
    if (!hasRelations && !hasRefRows) return;

    const { values: normalizedValues, rows: sanitizedRows } = buildTemporaryFormState(
      pendingTemporaryPromotion.entry,
    );
    setEditing(normalizedValues);
    setGridRows(sanitizedRows);
    promotionHydrationNeededRef.current = false;
  }, [
    buildTemporaryFormState,
    pendingTemporaryPromotion,
    refRows,
    relationConfigs,
    requestType,
    setEditing,
    setGridRows,
    showForm,
  ]);

    const openTemporaryDraft = useCallback(
      async (entry) => {
        if (!entry || !canCreateTemporary) return;
        await ensureColumnMeta();
        const { values: normalizedValues, rows: sanitizedRows } = buildTemporaryFormState(entry);

        const temporaryId = getTemporaryId(entry);
        setActiveTemporaryDraftId(temporaryId);
        setPendingTemporaryPromotion(null);
        setTemporaryPromotionQueue([]);
        setEditing(normalizedValues);
        setGridRows(sanitizedRows);
        setIsAdding(true);
        setRequestType(null);
        setShowTemporaryModal(false);
        setShowForm(true);
      },
      [
        buildTemporaryFormState,
        canCreateTemporary,
        ensureColumnMeta,
        setActiveTemporaryDraftId,
        setEditing,
        setGridRows,
        setIsAdding,
        setRequestType,
        setShowForm,
        setPendingTemporaryPromotion,
        setTemporaryPromotionQueue,
        setShowTemporaryModal,
      ],
    );

  async function rejectTemporary(id) {
    if (!canReviewTemporary) return;
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
      const rateLimitMessage = await getRateLimitMessage(res);
      if (rateLimitMessage) {
        addToast(rateLimitMessage, 'warning');
        return;
      }
      if (!res.ok) throw new Error('Failed to reject');
      addToast(t('temporary_rejected', 'Temporary rejected'), 'success');
      setTemporaryList((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const targetId = String(id);
        const filtered = prev.filter((entry) => getTemporaryId(entry) !== targetId);
        return filtered.length === prev.length ? prev : filtered;
      });
      await refreshTemporaryQueuesAfterDecision({ focusId: id });
    } catch (err) {
      console.error(err);
      addToast(t('temporary_reject_failed', 'Failed to reject temporary'), 'error');
    }
  }

  const canSelectTemporaries = canReviewTemporary && temporaryScope === 'review';

  useEffect(() => {
    setTemporarySelection((prev) => {
      if (!canSelectTemporaries) {
        if (prev.size === 0) return prev;
        return new Set();
      }
      const allowedIds = new Set();
      temporaryList.forEach((entry) => {
        if (!entry || entry.status !== 'pending') return;
        const id = getTemporaryId(entry);
        if (id) allowedIds.add(id);
      });
      const next = new Set();
      prev.forEach((id) => {
        if (allowedIds.has(id)) next.add(id);
      });
      if (next.size === prev.size) {
        let changed = false;
        prev.forEach((id) => {
          if (!next.has(id)) changed = true;
        });
        if (!changed) return prev;
      }
      return next;
    });
  }, [canSelectTemporaries, temporaryList]);

  const pendingReviewIds = useMemo(() => {
    if (!canSelectTemporaries) return [];
    const ids = [];
    temporaryList.forEach((entry) => {
      if (!entry || entry.status !== 'pending') return;
      const id = getTemporaryId(entry);
      if (id) ids.push(id);
    });
    return ids;
  }, [canSelectTemporaries, temporaryList]);

  const allReviewSelected =
    pendingReviewIds.length > 0 &&
    pendingReviewIds.every((id) => temporarySelection.has(id));
  const hasReviewSelection = canSelectTemporaries && temporarySelection.size > 0;

  const temporaryChainStats = useMemo(() => {
    const chain = Array.isArray(temporaryChainModalData?.chain)
      ? temporaryChainModalData.chain
      : [];
    if (chain.length === 0) {
      return {
        length: 0,
        pendingCount: 0,
        completedCount: 0,
        currentReviewer: null,
        lastUpdated: null,
      };
    }
    const pendingRows = chain.filter(
      (item) => (item?.status || '').toString().trim().toLowerCase() === 'pending',
    );
    const currentReviewerEntry = pendingRows[0] || null;
    const currentReviewerList = normalizePlanSeniorList(
      currentReviewerEntry?.planSeniorEmpIds ??
        currentReviewerEntry?.planSeniorEmpId ??
        currentReviewerEntry?.plan_senior_empid ??
        currentReviewerEntry?.plan_senior_emp_id ??
        currentReviewerEntry?.planSeniorEmpID ??
        currentReviewerEntry?.reviewerEmpIds ??
        currentReviewerEntry?.reviewerEmpId ??
        currentReviewerEntry?.reviewer_emp_id,
    );
    return {
      length: chain.length,
      pendingCount: pendingRows.length,
      completedCount: chain.length - pendingRows.length,
      currentReviewer: currentReviewerList[0] || null,
      lastUpdated: chain[chain.length - 1]?.updatedAt || null,
    };
  }, [normalizePlanSeniorList, temporaryChainModalData]);

  const temporaryChainView = useMemo(() => {
    const fullChain = Array.isArray(temporaryChainModalData?.chain)
      ? temporaryChainModalData.chain
      : [];
    const fullHistory = Array.isArray(temporaryChainModalData?.reviewHistory)
      ? temporaryChainModalData.reviewHistory
      : [];
    if (fullChain.length === 0) {
      return { chain: fullChain, reviewHistory: fullHistory };
    }
    const normalizePlanSenior = (row) => {
      const list = normalizePlanSeniorList(
        row?.planSeniorEmpIds ??
          row?.planSeniorEmpId ??
          row?.plan_senior_empid ??
          row?.plan_senior_emp_id ??
          row?.planSeniorEmpID ??
          row?.reviewerEmpIds ??
          row?.reviewerEmpId ??
          row?.reviewer_emp_id ??
          [],
      );
      if (list.length > 0) return list[0];
      return normalizeEmpId(
        row?.reviewedBy ??
          row?.reviewed_by ??
          row?.reviewerEmpId ??
          row?.reviewer_emp_id ??
          '',
      );
    };
    const normalizedChain = fullChain.map((row) => ({
      ...row,
      __normalizedPlanSenior: normalizePlanSenior(row),
    }));
    let sliceEnd = normalizedChain.length - 1;
    if (normalizedViewerDirectSeniorId) {
      const seniorIdx = normalizedChain.findIndex(
        (row) => row.__normalizedPlanSenior === normalizedViewerDirectSeniorId,
      );
      if (seniorIdx >= 0) {
        sliceEnd = Math.min(normalizedChain.length - 1, seniorIdx + 1);
      }
    }
    const visibleChain = normalizedChain.slice(0, sliceEnd + 1);
    const visibleIds = new Set(
      visibleChain
        .map((row) => String(row?.id ?? row?.temporaryId ?? row?.temporary_id ?? '').trim())
        .filter(Boolean),
    );
    const visibleHistory = fullHistory.filter((item) => {
      const tempId = String(
        item?.temporaryId || item?.temporary_id || item?.temporaryid || item?.id || '',
      ).trim();
      if (!tempId) return true;
      return visibleIds.has(tempId);
    });
    return { chain: visibleChain, reviewHistory: visibleHistory };
  }, [normalizeEmpId, normalizePlanSeniorList, normalizedViewerDirectSeniorId, temporaryChainModalData]);

  const latestTemporaryReviewById = useMemo(() => {
    const history = Array.isArray(temporaryChainModalData?.reviewHistory)
      ? temporaryChainModalData.reviewHistory
      : [];
    const map = new Map();
    history.forEach((item, idx) => {
      const temporaryId =
        item?.temporaryId || item?.temporary_id || item?.temporaryid || null;
      if (!temporaryId) return;
      const createdAtRaw = item?.createdAt || item?.created_at || null;
      const createdAtTs = createdAtRaw ? Date.parse(createdAtRaw) : Number.NaN;
      const orderValue = Number.isFinite(createdAtTs) ? createdAtTs : idx;
      const existing = map.get(temporaryId);
      if (existing && existing.order >= orderValue) return;
      map.set(temporaryId, {
        action: item?.action || '',
        reviewer:
          item?.reviewerEmpId || item?.reviewer_emp_id || item?.reviewer || '',
        createdAt: createdAtRaw,
        order: orderValue,
      });
    });
    return map;
  }, [temporaryChainModalData]);

  const toggleTemporarySelection = useCallback(
    (id) => {
      if (!canSelectTemporaries || !id) return;
      setTemporarySelection((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [canSelectTemporaries],
  );

  const toggleTemporarySelectAll = useCallback(
    (checked) => {
      if (!canSelectTemporaries) return;
      if (!checked) {
        setTemporarySelection(new Set());
        return;
      }
      setTemporarySelection(() => {
        const next = new Set();
        pendingReviewIds.forEach((id) => next.add(id));
        return next;
      });
    },
    [canSelectTemporaries, pendingReviewIds],
  );

  const clearTemporarySelection = useCallback(() => {
    setTemporarySelection(new Set());
  }, []);

  const promoteTemporarySelection = useCallback(async () => {
    if (!canSelectTemporaries) return;
    const ids = Array.from(temporarySelection);
    if (ids.length === 0) return;
    const pendingEntries = ids
      .map((id) =>
        temporaryList.find((entry) => getTemporaryId(entry) === id),
      )
      .filter((entry) => entry && entry.status === 'pending');
    if (pendingEntries.length === 0) {
      addToast(
        t('temporary_promote_missing', 'Unable to promote temporary submission'),
        'error',
      );
      return;
    }
    if (
      !window.confirm(
        t(
          'temporary_promote_selected_confirm',
          'Promote all selected temporary records?',
        ),
      )
    ) {
      return;
    }
    const [firstEntry, ...remaining] = pendingEntries;
    setTemporaryPromotionQueue(remaining);
    await openTemporaryPromotion(firstEntry, { resetQueue: false });
  }, [
    canSelectTemporaries,
    temporarySelection,
    temporaryList,
    openTemporaryPromotion,
    addToast,
    t,
  ]);

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
  const formColumnOrder = useMemo(() => {
    const seen = new Set();
    const merged = [];
    ordered.forEach((col) => {
      if (seen.has(col)) return;
      seen.add(col);
      merged.push(col);
    });
    allColumns.forEach((col) => {
      if (seen.has(col)) return;
      seen.add(col);
      merged.push(col);
    });
    return merged;
  }, [ordered, allColumns]);
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

  const totalAmountSet = useMemo(
    () => new Set(formConfig?.totalAmountFields || []),
    [formConfig],
  );
  const totalCurrencySet = useMemo(
    () => new Set(formConfig?.totalCurrencyFields || []),
    [formConfig],
  );

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
      const normalizedKey = normalizeRelationKey(o.value);
      if (normalizedKey) {
        labelMap[col][normalizedKey] = o.label;
      }
    });
  });

  useEffect(() => {
    let canceled = false;
    const immediateUpdates = {};
    const pending = [];
    rows.forEach((row) => {
      columns.forEach((column) => {
        if (fieldTypeMap[column] !== 'json') return;
        const relationConfig = relationConfigs[column];
        if (!relationConfig?.table) return;
        const values = normalizeJsonArray(row?.[column]);
        if (!Array.isArray(values) || values.length === 0) return;
        const relationRows = refRows[column] || {};
        values.forEach((item) => {
          const relationId = resolveScopeId(item);
          const key = relationId ?? item;
          const cacheKey = key === undefined || key === null ? '' : String(key);
          if (!cacheKey) return;
          if (jsonRelationLabels[column]?.[cacheKey]) return;
          const cachedRow = getRelationRowFromMap(relationRows, key);
          if (cachedRow && typeof cachedRow === 'object') {
            if (!immediateUpdates[column]) immediateUpdates[column] = {};
            immediateUpdates[column][cacheKey] = formatRelationDisplay(
              cachedRow,
              relationConfig,
              key,
            );
            return;
          }
          const requestKey = `${column}|${cacheKey}`;
          if (jsonRelationFetchCache.current[requestKey]) return;
          jsonRelationFetchCache.current[requestKey] = true;
          pending.push(
            (async () => {
              try {
                const idField = relationConfig.idField || relationConfig.column || column;
                const displayCfg =
                  relationConfig.displayFields && relationConfig.displayFields.length > 0
                    ? null
                    : await fetchRelationDisplayConfig(
                        relationConfig.table,
                        idField,
                      );
                const displayFields =
                  relationConfig.displayFields && relationConfig.displayFields.length > 0
                    ? relationConfig.displayFields
                    : displayCfg?.displayFields || [];
                const params = new URLSearchParams({ page: 1, perPage: 1 });
                params.set(idField, key);
                const res = await fetch(
                  `/api/tables/${encodeURIComponent(relationConfig.table)}?${params.toString()}`,
                  { credentials: 'include' },
                );
                let fetchedRow = null;
                if (res.ok) {
                  const json = await res.json().catch(() => ({}));
                  fetchedRow = Array.isArray(json.rows) ? json.rows[0] : null;
                }
                if (canceled) return;
                if (fetchedRow && typeof fetchedRow === 'object') {
                  const label = formatRelationDisplay(
                    fetchedRow,
                    { ...relationConfig, displayFields },
                    key,
                  );
                  if (label) {
                    setJsonRelationLabels((prev) => {
                      const next = { ...prev };
                      next[column] = { ...(prev[column] || {}), [cacheKey]: label };
                      return next;
                    });
                  }
                }
              } catch {
                /* ignore */
              } finally {
                delete jsonRelationFetchCache.current[requestKey];
              }
            })(),
          );
        });
      });
    });
    if (Object.keys(immediateUpdates).length > 0) {
      setJsonRelationLabels((prev) => {
        const next = { ...prev };
        Object.entries(immediateUpdates).forEach(([col, map]) => {
          next[col] = { ...(prev[col] || {}), ...map };
        });
        return next;
      });
    }
    if (pending.length > 0) {
      Promise.all(pending).catch(() => {});
    }
    return () => {
      canceled = true;
    };
  }, [
    rows,
    columns,
    fieldTypeMap,
    relationConfigs,
    refRows,
    jsonRelationLabels,
    normalizeJsonArray,
    formatRelationDisplay,
    fetchRelationDisplayConfig,
  ]);

  const isPlainValueObject = useCallback(
    (value) =>
      Boolean(
        value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          !(value instanceof Date),
      ),
    [],
  );

  const parseMaybeJson = useCallback((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const startsWith = trimmed[0];
    const endsWith = trimmed[trimmed.length - 1];
    if (
      (startsWith === '{' && endsWith === '}') ||
      (startsWith === '[' && endsWith === ']') ||
      (startsWith === '"' && endsWith === '"')
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  }, []);

  const stringifyPreviewCell = useCallback(
    (value) => {
      const seen = new Set();
      const collect = (input) => {
        if (input === undefined || input === null || input === '') return [];
        if (typeof input === 'string') return [input];
        if (typeof input === 'number' || typeof input === 'boolean') return [String(input)];
        if (input instanceof Date) return [input.toISOString()];
        if (seen.has(input)) return [];
        if (Array.isArray(input)) {
          seen.add(input);
          const nested = input.flatMap((item) => collect(item));
          seen.delete(input);
          return nested;
        }
        if (isPlainValueObject(input)) {
          seen.add(input);
          const nested = Object.values(input).flatMap((item) => collect(item));
          seen.delete(input);
          return nested;
        }
        const fallback = String(input);
        if (!fallback || fallback === '[object Object]') return [];
        return [fallback];
      };

      const flattened = collect(value)
        .map((item) => (typeof item === 'string' ? item : String(item)))
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      if (flattened.length === 0) return '—';
      return flattened.join(', ');
    },
    [isPlainValueObject],
  );

  const temporaryValueButtonStyle = useMemo(
    () => ({
      padding: '0.15rem 0.4rem',
      fontSize: '0.7rem',
      borderRadius: '4px',
      border: '1px solid #3b82f6',
      backgroundColor: '#eff6ff',
      color: '#1d4ed8',
      cursor: 'pointer',
    }),
    [],
  );

  const openTemporaryPreview = useCallback(
    (column, value) => {
      let structured = value;
      if (typeof structured === 'string') {
        structured = parseMaybeJson(structured);
      }
      let rows = [];
      if (Array.isArray(structured)) {
        rows = structured.map((item, idx) => {
          if (isPlainValueObject(item)) return item;
          if (Array.isArray(item)) {
            const nested = {};
            item.forEach((entry, entryIdx) => {
              nested[`Value ${entryIdx + 1}`] = entry;
            });
            return nested;
          }
          return { Value: item };
        });
      } else if (isPlainValueObject(structured)) {
        rows = [structured];
      } else {
        rows = [{ Value: structured }];
      }

      const columnKeys = new Set();
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        Object.keys(row).forEach((key) => columnKeys.add(key));
      });
      if (columnKeys.size === 0) {
        columnKeys.add('Value');
      }
      const columnList = Array.from(columnKeys);
      const normalizedRows = rows.length > 0 ? rows : [{ Value: structured }];
      const displayRows = normalizedRows.map((row) => {
        const normalized = {};
        columnList.forEach((key) => {
          const cellValue = row && typeof row === 'object' ? row[key] : undefined;
          normalized[key] = stringifyPreviewCell(cellValue);
        });
        return normalized;
      });

      let activeColumns = columnList.filter((key) =>
        displayRows.some((row) => {
          const cell = row[key];
          return cell !== undefined && cell !== null && cell !== '' && cell !== '—';
        }),
      );

      let normalizedDisplayRows;
      if (activeColumns.length === 0) {
        activeColumns = ['Value'];
        normalizedDisplayRows = [{ Value: stringifyPreviewCell(structured) }];
      } else {
        normalizedDisplayRows = displayRows.map((row) => {
          const normalized = {};
          activeColumns.forEach((key) => {
            normalized[key] = row[key] ?? '—';
          });
          return normalized;
        });
      }

      setTemporaryValuePreview({
        title: labels[column] || column,
        columns: activeColumns,
        rows: normalizedDisplayRows,
      });
    },
    [labels, parseMaybeJson, stringifyPreviewCell, isPlainValueObject],
  );

  const formatTemporaryFieldValue = useCallback(
    (column, rawValue) => {
      if (rawValue === undefined || rawValue === null || rawValue === '') return '—';

      const relation = relationOpts[column];
      const mapRelationValue = (value) => {
        const unwrapRelationValue = (input) => {
          if (Array.isArray(input)) {
            return input.map((item) => unwrapRelationValue(item));
          }
          if (isPlainValueObject(input)) {
            if (Object.prototype.hasOwnProperty.call(input, 'value')) {
              return unwrapRelationValue(input.value);
            }
            if (Object.prototype.hasOwnProperty.call(input, 'id')) {
              return unwrapRelationValue(input.id);
            }
            if (Object.prototype.hasOwnProperty.call(input, 'key')) {
              return unwrapRelationValue(input.key);
            }
            if (Object.prototype.hasOwnProperty.call(input, 'code')) {
              return unwrapRelationValue(input.code);
            }
          }
          return input;
        };

        if (!relation) {
          return stripTemporaryLabelValue(value);
        }

        const applyRelationLabel = (input) => {
          if (Array.isArray(input)) {
            return input.map((item) => applyRelationLabel(item));
          }
          const normalized = unwrapRelationValue(input);
          const isLookupFriendly =
            normalized !== undefined &&
            normalized !== null &&
            (typeof normalized === 'string' ||
              typeof normalized === 'number' ||
              typeof normalized === 'boolean');
          if (isLookupFriendly) {
            const mapped = labelMap[column]?.[normalizeRelationKey(normalized)];
            if (mapped !== undefined) {
              return mapped;
            }
          }
          return normalized;
        };

        return applyRelationLabel(value);
      };

      let value = parseMaybeJson(rawValue);
      value = mapRelationValue(value);

      if (Array.isArray(value)) {
        const primitives = value.filter(
          (item) => item !== null && item !== undefined && typeof item !== 'object',
        );
        if (primitives.length === value.length) {
          const display = primitives
            .map((item) => (typeof item === 'string' ? item : String(item)))
            .join(', ');
          return display || '—';
        }
        const objectItems = value.filter((item) => isPlainValueObject(item));
        if (objectItems.length === value.length && value.length > 0) {
          return (
            <button
              type="button"
              style={temporaryValueButtonStyle}
              onClick={() => openTemporaryPreview(column, value)}
            >
              {t('temporary_view_table', 'View table')} ({value.length})
            </button>
          );
        }
        return (
          <button
            type="button"
            style={temporaryValueButtonStyle}
            onClick={() => openTemporaryPreview(column, value)}
          >
            {t('temporary_view_details', 'View details')}
          </button>
        );
      }

      if (isPlainValueObject(value)) {
        const entries = Object.entries(value);
        const primitiveEntries = entries.filter(
          ([, item]) => item !== null && item !== undefined && typeof item !== 'object',
        );
        if (primitiveEntries.length === entries.length && entries.length > 0) {
          return primitiveEntries
            .map(([, item]) => (typeof item === 'string' ? item : String(item)))
            .join(', ');
        }
        return (
          <button
            type="button"
            style={temporaryValueButtonStyle}
            onClick={() => openTemporaryPreview(column, value)}
          >
            {t('temporary_view_details', 'View details')}
          </button>
        );
      }

      if (column === 'TotalCur' || totalCurrencySet.has(column)) {
        return currencyFmt.format(Number(value || 0));
      }

      let str = typeof value === 'string' ? value : String(value);
      if (
        fieldTypeMap[column] === 'date' ||
        fieldTypeMap[column] === 'datetime' ||
        fieldTypeMap[column] === 'time'
      ) {
        const normalized = normalizeDateInput(str, placeholders[column]);
        return normalized || str;
      }
      if (placeholders[column] === undefined && /^\d{4}-\d{2}-\d{2}T/.test(str)) {
        const normalized = normalizeDateInput(str, 'YYYY-MM-DD');
        return normalized || str;
      }
      return str;
    },
    [
      fieldTypeMap,
      labelMap,
      openTemporaryPreview,
      parseMaybeJson,
      placeholders,
      relationOpts,
      t,
      temporaryValueButtonStyle,
      totalCurrencySet,
      isPlainValueObject,
    ],
  );


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
  let formColumns = formColumnOrder.filter((c) => {
    if (autoCols.has(c)) return false;
    const lower = c.toLowerCase();
    if (auditFieldSet.has(lower) && !(editSet?.has(lower))) return false;
    return true;
  });

  const lockedDefaults = Array.from(
    new Set(
      Object.entries(formConfig?.defaultValues || {})
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
        .map(([k]) => resolveCanonicalKey(k))
        .filter(Boolean),
    ),
  );

  const canonicalizeFormFields = useMemo(
    () =>
      (fields) => {
        const seen = new Set();
        const canonical = [];
        walkEditableFieldValues(fields, (field) => {
          const resolved = resolveCanonicalKey(field);
          if (!resolved || seen.has(resolved)) return;
          seen.add(resolved);
          canonical.push(resolved);
        });
        if (canonical.length <= 1) return canonical;
        const ordered = formColumnOrder.filter((key) => seen.has(key));
        if (ordered.length === canonical.length) return ordered;
        if (ordered.length > 0) {
          const remaining = canonical.filter((key) => !ordered.includes(key));
          return [...ordered, ...remaining];
        }
        return canonical;
      },
    [formColumnOrder, resolveCanonicalKey],
  );

  const headerFields = useMemo(
    () => canonicalizeFormFields(formConfig?.headerFields || []),
    [canonicalizeFormFields, formConfig?.headerFields],
  );

  const mainFields = useMemo(
    () => canonicalizeFormFields(formConfig?.mainFields || []),
    [canonicalizeFormFields, formConfig?.mainFields],
  );

  const footerFields = useMemo(
    () => canonicalizeFormFields(formConfig?.footerFields || []),
    [canonicalizeFormFields, formConfig?.footerFields],
  );

  const sectionFields = new Set([
    ...(headerFields || []),
    ...(mainFields || []),
    ...(footerFields || []),
  ]);
  sectionFields.forEach((f) => {
    if (!formColumns.includes(f) && allColumns.includes(f)) formColumns.push(f);
  });

  const {
    disabledFields: computedDisabledFields,
    bypassGuardDefaults: canBypassGuardDefaults,
  } = resolveDisabledFieldState({
    editSet,
    formColumns,
    requestType,
    isAdding,
    editing,
    lockedDefaults,
    canonicalizeFormFields,
    buttonPerms,
    getKeyFields,
  });
  const disabledFields = computedDisabledFields;
  const guardOverridesActive =
    canBypassGuardDefaults && (Array.isArray(disabledFields) ? disabledFields.length === 0 : true);

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

  const selectedRowForPrint = useMemo(() => {
    if (selectedRows.size === 0) return null;
    const [firstId] = selectedRows;
    if (firstId === undefined || firstId === null) return null;
    const match = rows.find((row) => {
      const rid = getRowId(row);
      return rid !== undefined && String(rid) === String(firstId);
    });
    return match || null;
  }, [rows, selectedRows]);

  const selectedRowsForPrint = useMemo(() => {
    if (selectedRows.size === 0) return [];
    const selectedIds = new Set(Array.from(selectedRows, (id) => String(id)));
    return rows.filter((row) => {
      const rid = getRowId(row);
      return rid !== undefined && selectedIds.has(String(rid));
    });
  }, [rows, selectedRows]);

  const buildPrintPayloadFromRow = useCallback(
    (row) => {
      const baseRow = row && typeof row === 'object' ? { ...row } : {};
      const normalizedRows = normalizeJsonArray(row?.rows);
      const gridRows = normalizedRows
        .filter((entry) => entry !== undefined && entry !== null && entry !== '')
        .map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry));
      return { formVals: baseRow, gridRows };
    },
    [normalizeJsonArray],
  );

  const buildPrintPayloadFromRows = useCallback(
    (rowsToPrint) => {
      const itemsMap = new Map();
      const groupedFields = [
        ...new Set([
          ...headerFields,
          ...footerFields,
          ...(formConfig?.signatureFields || []),
        ]),
      ];
      const buildGroupKey = (row) => {
        if (groupedFields.length === 0) return 'default';
        const keyData = {};
        groupedFields.forEach((field) => {
          keyData[field] = row?.[field] ?? null;
        });
        return JSON.stringify(keyData);
      };
      const rowsList = Array.isArray(rowsToPrint)
        ? rowsToPrint.filter((row) => row && typeof row === 'object')
        : [];
      rowsList.forEach((row) => {
        const key = buildGroupKey(row);
        const existing = itemsMap.get(key);
        if (existing) {
          existing.gridRows.push(row);
          return;
        }
        const formVals = row && typeof row === 'object' ? { ...row } : {};
        itemsMap.set(key, { formVals, gridRows: [row] });
      });
      return { formRows: Array.from(itemsMap.values()) };
    },
    [footerFields, formConfig?.signatureFields, headerFields],
  );

  const openPrintModalForRows = useCallback(
    (rowsToPrint) => {
      const payload = buildPrintPayloadFromRows(rowsToPrint);
      const normalizedPayload = {
        ...payload,
        isReceipt: payload?.isReceipt ?? formConfig?.posApiEnabled,
      };
      setPrintPayload(normalizedPayload);
      setPrintEmpSelected(true);
      setPrintCustSelected(true);
      skipPrintCopiesAutoRef.current = true;
      setPrintCopies('1');
      setPrintModalOpen(true);
    },
    [buildPrintPayloadFromRows, formConfig?.posApiEnabled],
  );

  const openPrintModalForPayload = useCallback(
    (payload) => {
      const resolvedPayload =
        payload ||
        buildPrintPayloadFromRow(editing || (Array.isArray(gridRows) ? gridRows[0] : null));
      const normalizedPayload = {
        ...resolvedPayload,
        isReceipt: resolvedPayload?.isReceipt ?? formConfig?.posApiEnabled,
      };
      setPrintPayload(normalizedPayload);
      setPrintEmpSelected(true);
      setPrintCustSelected(true);
      skipPrintCopiesAutoRef.current = true;
      setPrintCopies('1');
      setPrintModalOpen(true);
    },
    [buildPrintPayloadFromRow, editing, formConfig?.posApiEnabled, gridRows],
  );

  const closePrintModal = useCallback(() => {
    setPrintModalOpen(false);
    setPrintPayload(null);
  }, []);

  const handlePrintSelection = useCallback(
    (modes, payload, copiesValue = 1, options = {}) => {
      if (!payload || !Array.isArray(modes) || modes.length === 0) return;
      const activePayload = payload || buildPrintPayloadFromRow(selectedRowForPrint);
      const isReceipt = Boolean(options?.isReceipt ?? activePayload?.isReceipt);
      const rowPayloads =
        Array.isArray(activePayload.formRows) && activePayload.formRows.length > 0
          ? activePayload.formRows
          : [activePayload];
      const allFields = [...headerFields, ...mainFields, ...footerFields];
      const hasDefinedSections = allFields.length > 0;
      const headerCols = hasDefinedSections ? headerFields : [];
      const mainCols = hasDefinedSections ? mainFields : formColumns;
      const footerCols = hasDefinedSections ? footerFields : [];
      const signatureFields = formConfig?.signatureFields || [];
      const signatureSet = new Set(signatureFields);
      const labelKeys = ['label', 'name', 'title', 'text', 'display', 'displayName', 'code'];
      const resolveLabelWrapperValue = (value) => {
        if (value === undefined || value === null) return value;
        if (Array.isArray(value)) return value.map(resolveLabelWrapperValue);
        if (typeof value !== 'object') return value;
        for (const key of labelKeys) {
          if (value[key] !== undefined && value[key] !== null && value[key] !== '') {
            return value[key];
          }
        }
        if (value.value !== undefined && value.value !== null) return value.value;
        return value;
      };
      const resolveSinglePrintValue = (col, value) => {
        const labelWrapper = resolveLabelWrapperValue(value);
        const baseValue =
          value && typeof value === 'object' && !Array.isArray(value) && value.value !== undefined
            ? value.value
            : labelWrapper;
        const normalizedValueKey = normalizeRelationKey(normalizeSearchValue(baseValue));
        if (relationOpts[col] && normalizedValueKey !== undefined && labelMap[col]) {
          const optionLabel = labelMap[col][normalizedValueKey];
          if (optionLabel !== undefined) return optionLabel;
        }
        if (relationConfigs[col]?.table && normalizedValueKey !== undefined && normalizedValueKey !== null) {
          const relationRows = refRows[col] || {};
          const rowData = getRelationRowFromMap(relationRows, normalizedValueKey);
          if (rowData && typeof rowData === 'object') {
            return formatRelationDisplay(rowData, relationConfigs[col], normalizedValueKey);
          }
        }
        const displayInfo = relationDisplayMap[col];
        if (displayInfo && normalizedValueKey !== undefined && normalizedValueKey !== null) {
          const relationRows = refRows[displayInfo.sourceColumn] || {};
          const rowData = getRelationRowFromMap(relationRows, normalizedValueKey);
          if (rowData && typeof rowData === 'object') {
            return formatRelationDisplay(rowData, displayInfo.config, normalizedValueKey);
          }
        }
        if (labelWrapper !== undefined && labelWrapper !== null && labelWrapper !== '') {
          return labelWrapper;
        }
        return baseValue ?? '';
      };
      const resolvePrintValue = (col, row) => {
        const raw = row?.[col];
        if (fieldTypeMap[col] === 'json') {
          const arr = normalizeJsonArray(raw);
          const relationConfig = relationConfigs[col];
          if (relationConfig?.table && arr.length > 0) {
            const rowsMap = refRows[col] || {};
            const parts = [];
            arr.forEach((val) => {
              const relationId = resolveScopeId(val);
              const key = relationId ?? val ?? '';
              const cacheKey = key === null || key === undefined ? '' : String(key);
              const cachedLabel = cacheKey ? jsonRelationLabels[col]?.[cacheKey] : null;
              if (cachedLabel) {
                parts.push(cachedLabel);
                return;
              }
              const relationRow = getRelationRowFromMap(rowsMap, key);
              if (relationRow && typeof relationRow === 'object') {
                const formatted = formatRelationDisplay(relationRow, relationConfig, key);
                if (formatted || formatted === 0 || formatted === false) {
                  parts.push(formatted);
                }
              } else {
                const formatted = formatJsonItem(key);
                if (formatted || formatted === 0 || formatted === false) {
                  parts.push(String(formatted));
                }
              }
            });
            const formatted = parts.join(', ');
            return formatted ?? '';
          }
          return formatJsonList(arr);
        }
        const resolved = Array.isArray(raw)
          ? raw.map((item) => resolveSinglePrintValue(col, item))
          : resolveSinglePrintValue(col, raw);
        const formatted = formatJsonItem(resolved);
        if (placeholders[col]) {
          return normalizeDateInput(formatted, placeholders[col]);
        }
        return formatted ?? '';
      };

      const columnTableHtml = (cols, row, skipEmpty = false, className = '', isSignature = false) => {
        const filtered = cols.filter((c) =>
          skipEmpty
            ? row?.[c] !== '' && row?.[c] !== null && row?.[c] !== 0 && row?.[c] !== undefined
            : true,
        );
        if (filtered.length === 0) return '';
        if (isSignature) {
          const rows = filtered
            .map((c) => {
              const value = resolvePrintValue(c, row);
              return `<tr><th class="print-signature-label">${labels[c] || c}</th><td class="print-signature-value">${value}</td></tr>`;
            })
            .join('');
          return `<table${className ? ` class="${className}"` : ''}><tbody>${rows}</tbody></table>`;
        }
        const header = filtered.map((c) => `<th>${labels[c] || c}</th>`).join('');
        const valueStyle = isSignature ? ' style="text-align:right; padding-left:50mm;"' : '';
        const values = filtered
          .map((c) => `<td${valueStyle}>${resolvePrintValue(c, row)}</td>`)
          .join('');
        return `<table${className ? ` class="${className}"` : ''}><thead><tr>${header}</tr></thead><tbody><tr>${values}</tr></tbody></table>`;
      };

      const mainTableHtml = (cols, formVals, gridRows) => {
        if (!Array.isArray(gridRows) || gridRows.length === 0) {
          return columnTableHtml(cols, formVals, true, 'print-main-table');
        }
        const used = cols.filter((c) =>
          gridRows.some(
            (r) => r[c] !== '' && r[c] !== null && r[c] !== 0 && r[c] !== undefined,
          ),
        );
        if (used.length === 0) {
          return columnTableHtml(cols, formVals, true, 'print-main-table');
        }
        const header = used.map((c) => `<th>${labels[c] || c}</th>`).join('');
        const body = gridRows
          .map(
            (r) =>
              '<tr>' +
              used.map((c) => `<td>${resolvePrintValue(c, r)}</td>`).join('') +
              '</tr>',
          )
          .join('');
        const sumColumns = used.filter(
          (c) =>
            c === 'TotalCur' ||
            c === 'TotalAmt' ||
            totalCurrencySet.has(c) ||
            totalAmountSet.has(c),
        );
        const sums = {};
        gridRows.forEach((row) => {
          sumColumns.forEach((col) => {
            const raw = row?.[col];
            const parsed = Number(String(raw ?? 0).replace(',', '.'));
            if (Number.isFinite(parsed)) {
              sums[col] = (sums[col] || 0) + parsed;
            }
          });
        });
        const totalRow = [
          '<tr>',
          `<td><strong>НИЙТ</strong></td>`,
          ...used.slice(1).map((col) => {
            if (sumColumns.includes(col)) {
              const value = sums[col] || 0;
              const formatted =
                col === 'TotalCur' || totalCurrencySet.has(col)
                  ? currencyFmt.format(value)
                  : value;
              return `<td><strong>${formatted}</strong></td>`;
            }
            return '<td></td>';
          }),
          '</tr>',
        ].join('');
        const countRow =
          used.length === 1
            ? `<tr><td><strong>мөрийн тоо: ${gridRows.length}</strong></td></tr>`
            : [
                '<tr>',
                `<td><strong>мөрийн тоо</strong></td>`,
                `<td><strong>${gridRows.length}</strong></td>`,
                ...used.slice(2).map(() => '<td></td>'),
                '</tr>',
              ].join('');
        const footer = `<tfoot>${totalRow}${countRow}</tfoot>`;
        return `<table class="print-main-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody>${footer}</table>`;
      };

      const signatureHtml = (cols, formVals) => {
        if (cols.length === 0) return '';
        const table = columnTableHtml(cols, formVals, true, 'print-signature-table', true);
        if (!table) return '';
        return `<h3>Signature</h3>${table}`;
      };

      const normalizeCopies = (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 1) return 1;
        return parsed;
      };
      const copies = normalizeCopies(copiesValue);
      const useModeGrid = copies === 1 && modes.length > 1;
      const buildSection = (mode, formVals, gridRows) => {
        const list = mode === 'emp' ? formConfig?.printEmpField || [] : formConfig?.printCustField || [];
        const allowed = new Set(list.length > 0 ? list : [...headerCols, ...mainCols, ...footerCols]);
        const h = headerCols.filter((c) => allowed.has(c) && !signatureSet.has(c));
        const m = mainCols.filter((c) => allowed.has(c) && !signatureSet.has(c));
        const f = footerCols.filter((c) => allowed.has(c) && !signatureSet.has(c));
        const signatureCols = signatureFields.filter((c) => allowed.has(c));
        let section = '';
        if (h.length) {
          const table = columnTableHtml(h, formVals, true);
          if (table) section += `<h3>Header</h3>${table}`;
        }
        if (m.length) {
          const mainTable = mainTableHtml(m, formVals, gridRows);
          if (mainTable) section += `<h3>Main</h3>${mainTable}`;
        }
        if (f.length) {
          const table = columnTableHtml(f, formVals, true);
          if (table) section += `<h3>Footer</h3>${table}`;
        }
        if (signatureCols.length) {
          const signatureBlock = signatureHtml(signatureCols, formVals);
          if (signatureBlock) section += signatureBlock;
        }
        return section;
      };
      const renderCopies = (section) => {
        const items = Array.from({ length: copies }, () => `<div class="print-item">${section}</div>`).join('');
        const className = copies > 1 ? 'print-copies print-copies-grid' : 'print-copies';
        return `<div class="${className}">${items}</div>`;
      };
      const sections = rowPayloads
        .flatMap((rowPayload) => {
          const activeFormVals = rowPayload?.formVals || {};
          const activeGridRows = Array.isArray(rowPayload?.gridRows) ? rowPayload.gridRows : [];
          const modeSections = modes
            .map((mode) => {
              const section = buildSection(mode, activeFormVals, activeGridRows);
              if (!section) return '';
              const content = renderCopies(section);
              if (useModeGrid) {
                return `<div class="print-mode">${content}</div>`;
              }
              return `<section class="print-group">${content}</section>`;
            })
            .filter(Boolean);
          if (useModeGrid) {
            if (modeSections.length === 0) return [];
            return [
              `<section class="print-group print-group-grid" style="grid-template-columns:repeat(${modeSections.length},minmax(0,1fr));">${modeSections.join('')}</section>`,
            ];
          }
          return modeSections;
        })
        .join('');

      const normalizePrintNumber = (value) => {
        const parsed = Number.parseFloat(value);
        if (!Number.isFinite(parsed)) return null;
        return parsed;
      };
      const receiptMargin = normalizePrintNumber(printConfig.receiptMargin);
      const receiptGap = normalizePrintNumber(printConfig.receiptGap);
      const receiptFontSize = normalizePrintNumber(printConfig.receiptFontSize);
      const receiptWidth = normalizePrintNumber(printConfig.receiptWidth);
      const receiptHeight = normalizePrintNumber(printConfig.receiptHeight);
      const printWidth = normalizePrintNumber(printConfig.widthValue ?? printConfig.printWidth);
      const printHeight = normalizePrintNumber(printConfig.heightValue ?? printConfig.printHeight);
      const printMargin = normalizePrintNumber(printConfig.printMargin ?? printConfig.margin);
      const printGap = normalizePrintNumber(printConfig.printGap ?? printConfig.gap);
      const printFontSize = normalizePrintNumber(
        printConfig.printFontSize ?? printConfig.fontSize ?? printConfig.textSize,
      );
      const pageMarginValue = isReceipt ? receiptMargin : printMargin;
      const fontSizeValue = isReceipt ? receiptFontSize : printFontSize;
      const gapValue = isReceipt ? receiptGap : printGap;
      const pageMargin = pageMarginValue !== null ? `${pageMarginValue}mm` : isReceipt ? '0' : '1rem';
      const fontSize = fontSizeValue !== null ? `${fontSizeValue}px` : isReceipt ? 'inherit' : 'smaller';
      const gapSize = gapValue !== null ? `${gapValue}mm` : '0.75rem';
      const groupSpacing = gapValue !== null ? `${gapValue}mm` : '1rem';
      const widthValue = isReceipt ? receiptWidth : printWidth;
      const heightValue = isReceipt ? receiptHeight : printHeight;
      const pageWidth = widthValue ? `${widthValue}mm` : null;
      const pageHeight = heightValue ? `${heightValue}mm` : null;
      const pageSize = pageWidth && pageHeight ? `${pageWidth} ${pageHeight}` : 'A4';
      const pageSizeRule = pageSize;
      const sheetWidthRule = pageWidth
        ? `width:${pageWidth};max-width:${pageWidth};`
        : 'width:100%;';
      let html = '<html><head><title>Print</title>';
      html +=
        `<style>@page{size:${pageSizeRule};margin:${pageMargin};}@media print{body{margin:0;}.print-group{break-inside:avoid;page-break-inside:avoid;}}body{margin:0;} .print-sheet{box-sizing:border-box;font-size:${fontSize};${sheetWidthRule}} .print-sheet,.print-sheet *{font-size:${fontSize} !important;} .print-group{margin-bottom:${groupSpacing};} .print-group-grid{display:grid;align-items:start;gap:${gapSize};} .print-mode{break-inside:avoid;} .print-copies{display:grid;grid-template-columns:1fr;gap:${gapSize};} .print-copies.print-copies-grid{grid-template-columns:repeat(2,minmax(0,1fr));} .print-item{break-inside:avoid;} table{width:100%;border-collapse:collapse;margin-bottom:1rem;table-layout:auto;} th,td{padding:4px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;white-space:normal;max-width:100%;} img,svg,canvas{max-width:100%;height:auto;} .print-main-table th,.print-main-table td{border:1px solid #666;} .print-signature-table{table-layout:fixed;} .print-signature-table th{width:45%;} .print-signature-table td{width:55%;text-align:right;overflow-wrap:break-word;word-break:normal;white-space:normal;} h3{margin:0 0 4px 0;font-weight:600;}</style>`;
      html += `</head><body><div class="print-sheet">${sections}</div></body></html>`;

      if (userSettings?.printerId) {
        fetch(`${API_BASE}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ printerId: userSettings.printerId, content: html }),
        }).catch((err) => console.error('Print failed', err));
      } else {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      }
    },
    [
      API_BASE,
      buildPrintPayloadFromRow,
      footerFields,
      formColumns,
      formConfig,
      formatRelationDisplay,
      generalConfig,
      headerFields,
      jsonRelationLabels,
      labelMap,
      labels,
      mainFields,
      normalizeJsonArray,
      placeholders,
      relationConfigs,
      relationDisplayMap,
      relationOpts,
      refRows,
      selectedRowForPrint,
      totalAmountSet,
      totalCurrencySet,
      userSettings,
    ],
  );

  const confirmPrintSelection = useCallback(() => {
    const payload = printPayload || buildPrintPayloadFromRow(selectedRowForPrint);
    if (!payload) return;
    const normalizedPayload = {
      ...payload,
      isReceipt: payload?.isReceipt ?? formConfig?.posApiEnabled,
    };
    const modeList = [];
    if (printEmpSelected) modeList.push('emp');
    if (printCustSelected) modeList.push('cust');
    handlePrintSelection(modeList, normalizedPayload, printCopies, {
      isReceipt: normalizedPayload.isReceipt,
    });
    closePrintModal();
  }, [
    buildPrintPayloadFromRow,
    closePrintModal,
    handlePrintSelection,
    formConfig?.posApiEnabled,
    printCustSelected,
    printEmpSelected,
    printCopies,
    printPayload,
    selectedRowForPrint,
  ]);

  const uploadCfg = uploadRow ? getConfigForRow(uploadRow) : {};

  const reviewPendingCount = supportsTemporary &&
    availableTemporaryScopes.includes('review')
      ? Number(temporarySummary?.reviewPending || 0)
      : 0;
  const createdPendingCount = supportsTemporary &&
    availableTemporaryScopes.includes('created')
      ? Number(temporarySummary?.createdPending || 0)
      : 0;
  const hasTemporaryNotice =
    supportsTemporary && (reviewPendingCount > 0 || createdPendingCount > 0);
  const temporaryNoticeScope = reviewPendingCount > 0
    ? 'review'
    : availableTemporaryScopes.includes('created')
    ? 'created'
    : defaultTemporaryScope;

  const temporaryTabs = useMemo(
    () =>
      [
        canCreateTemporary && {
          scope: 'created',
          label: t('temporary_my_drafts', 'My drafts'),
          count: Number(temporarySummary?.createdPending ?? 0),
        },
        canReviewTemporary && {
          scope: 'review',
          label: t('temporary_review_queue', 'Review queue'),
          count: Number(temporarySummary?.reviewPending ?? 0),
        },
      ].filter(Boolean),
    [
      canCreateTemporary,
      canReviewTemporary,
      temporarySummary,
      t,
    ],
  );

  const showReviewActions = canReviewTemporary && temporaryScope === 'review';
  const showCreatorActions = canCreateTemporary && temporaryScope === 'created';
  const isTemporaryReviewMode = canReviewTemporary && temporaryScope === 'review';
  const isTemporaryReadOnlyMode =
    isTemporaryReviewMode && requestType === 'temporary-promote';
  const showForceResolvePendingToggle =
    isTemporaryReviewMode &&
    requestType === 'temporary-promote' &&
    isDirectReviewerForPendingPromotion;
  const temporarySaveEnabled =
    canSaveTemporaryDraft && (!isTemporaryReviewMode || shouldShowForwardTemporaryLabel);
  const workflowHint = useMemo(
    () => ({
      isRejected: workflowState.status === 'rejected',
      isTemporary: Boolean(workflowState.isTemporary),
    }),
    [workflowState],
  );

  const temporaryDetailColumns = useMemo(() => {
    const valueKeys = new Set();
    temporaryList.forEach((entry) => {
      const { values: normalizedValues } = buildTemporaryFormState(entry);
      Object.keys(normalizedValues || {}).forEach((key) => {
        if (key) {
          valueKeys.add(key);
        }
      });
    });

    const mergedColumns = columns.length > 0 ? [...columns, ...valueKeys] : [...valueKeys];
    return Array.from(new Set(mergedColumns.filter(Boolean)));
  }, [buildTemporaryFormState, columns, temporaryList]);

  let detailHeaderRendered = false;
  const forceResolveFooterContent = showForceResolvePendingToggle ? (
    <label className="inline-flex items-center space-x-2 text-sm text-gray-700">
      <input
        type="checkbox"
        className="rounded"
        checked={forceResolvePendingDrafts}
        onChange={(e) => setForceResolvePendingDrafts(e.target.checked)}
      />
      <span>
        {t(
          'temporary_force_resolve_chain',
          'Resolve other pending drafts in this chain',
        )}
      </span>
    </label>
  ) : null;

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
                const targetScope =
                  temporarySummary?.reviewPending > 0 ? 'review' : 'created';
                fetchTemporaryList(targetScope);
                if (typeof markTemporaryScopeSeen === 'function') {
                  markTemporaryScopeSeen(targetScope);
                }
              }}
              style={{ marginRight: '0.5rem', position: 'relative' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                {temporaryHasNew && (
                  <NotificationDots
                    colors={notificationDots}
                    size="0.35rem"
                    gap="0.12rem"
                    marginRight={0}
                  />
                )}
                {t('temporaries', 'Temporaries')}
              </span>
              {(reviewPendingCount > 0 || createdPendingCount > 0) && (
                <span
                  style={{
                    marginLeft: '0.5rem',
                    display: 'inline-flex',
                    gap: '0.35rem',
                    alignItems: 'center',
                  }}
                >
                  {availableTemporaryScopes.includes('review') && (
                    <span
                      style={{
                        background: '#2563eb',
                        color: '#fff',
                        borderRadius: '999px',
                        padding: '0 0.45rem',
                        fontSize: '0.7rem',
                      }}
                    >
                      R: {reviewPendingCount}
                    </span>
                  )}
                  {availableTemporaryScopes.includes('created') && (
                    <span
                      style={{
                        background: '#334155',
                        color: '#fff',
                        borderRadius: '999px',
                        padding: '0 0.45rem',
                        fontSize: '0.7rem',
                      }}
                    >
                      C: {createdPendingCount}
                    </span>
                  )}
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
        {selectedRows.size > 0 && (
          <TooltipWrapper title={t('print_selected', { ns: 'tooltip', defaultValue: 'Print selected transaction' })}>
            <button
              onClick={() => {
                if (selectedRowsForPrint.length === 0) return;
                openPrintModalForRows(selectedRowsForPrint);
              }}
              style={{ marginLeft: '0.5rem' }}
            >
              {t('print', 'Print')}
            </button>
          </TooltipWrapper>
        )}
      </div>
      {hasTemporaryNotice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            backgroundColor: reviewPendingCount > 0 ? '#fef3c7' : '#dbeafe',
            border: `1px solid ${reviewPendingCount > 0 ? '#f59e0b' : '#60a5fa'}`,
            color: '#1f2937',
          }}
        >
          <div>
            <strong>
              {reviewPendingCount > 0
                ? t(
                    'temporary_review_prompt_title',
                    'Temporary reviews pending',
                  )
                : t(
                    'temporary_draft_prompt_title',
                    'Temporary drafts saved',
                  )}
            </strong>
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: '#374151' }}>
              {reviewPendingCount > 0
                ? t(
                    'temporary_review_prompt_message',
                    'You have {{count}} temporary submissions waiting for approval.',
                    { count: reviewPendingCount },
                  )
                : t(
                    'temporary_draft_prompt_message',
                    'You have {{count}} temporary drafts waiting for submission.',
                    { count: createdPendingCount },
                  )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowTemporaryModal(true);
              fetchTemporaryList(temporaryNoticeScope);
            }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#1d4ed8',
              color: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {reviewPendingCount > 0
              ? t('temporary_review_prompt_cta', 'Open review workspace')
              : t('temporary_draft_prompt_cta', 'Open drafts')}
          </button>
        </div>
      )}
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
            <th
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                whiteSpace: 'nowrap',
                width: '24rem',
                minWidth: '24rem',
              }}
            >
              Action
            </th>
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
                overflow: 'visible',
                textOverflow: 'ellipsis',
              }}
            >
                {(() => {
                  const relationConfig = relationConfigs[c];
                  if (relationConfig?.table) {
                    const searchColumn =
                      relationConfig.idField || relationConfig.column || c;
                    const searchColumns = [
                      searchColumn,
                      ...(relationConfig.displayFields || []),
                    ];
                    return (
                      <AsyncSearchSelect
                        table={relationConfig.table}
                        searchColumn={searchColumn}
                        searchColumns={searchColumns}
                        labelFields={relationConfig.displayFields || []}
                        idField={searchColumn}
                        value={filters[c] || ''}
                        onChange={(val) => handleFilterChange(c, val ?? '')}
                        inputStyle={{ width: '100%' }}
                      />
                    );
                  }

                  if (Array.isArray(relationOpts[c])) {
                    return (
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
                    );
                  }

                  return (
                    <input
                      value={filters[c] || ''}
                      onChange={(e) => handleFilterChange(c, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  );
                })()}
              </th>
            ))}
            <th style={{ width: '24rem', minWidth: '24rem' }}></th>
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
            const locked = rowHasActiveLock(r, lockInfo);
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
                const rawValue = r[c];
                const relationConfig = relationConfigs[c];
                const relationInfo = relationConfig
                  ? { config: relationConfig, sourceColumn: c }
                  : relationDisplayMap[c];
                const raw = relationOpts[c]
                  ? labelMap[c][normalizeRelationKey(rawValue)] ||
                    (rawValue == null ? '' : String(rawValue))
                  : rawValue == null
                  ? ''
                  : String(rawValue);
                let display = raw;
                let displayLines = null;
                if (fieldTypeMap[c] === 'json') {
                  const arr = normalizeJsonArray(rawValue);
                  const relationConfig = relationConfigs[c];
                  if (relationConfig?.table && arr.length > 0) {
                    const rowsMap = refRows[c] || {};
                    const parts = [];
                    arr.forEach((val) => {
                      const relationId = resolveScopeId(val);
                      const key = relationId ?? val ?? '';
                      const cacheKey = key === null || key === undefined ? '' : String(key);
                      const cachedLabel = cacheKey
                        ? jsonRelationLabels[c]?.[cacheKey]
                        : null;
                      if (cachedLabel) {
                        parts.push(cachedLabel);
                        return;
                      }
                      const row = getRelationRowFromMap(rowsMap, key);
                      if (row && typeof row === 'object') {
                        const formatted = formatRelationDisplay(
                          row,
                          relationConfig,
                          key,
                        );
                        if (formatted || formatted === 0 || formatted === false) {
                          parts.push(formatted);
                        }
                      } else {
                        const formatted = formatJsonItem(key);
                        if (formatted || formatted === 0 || formatted === false) {
                          parts.push(String(formatted));
                        }
                      }
                    });
                    displayLines = parts;
                  } else {
                    displayLines = formatJsonListLines(arr);
                  }
                  display = displayLines.join(', ');
                } else if (c === 'TotalCur' || totalCurrencySet.has(c)) {
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
                let searchTerm = sanitizeName(raw);
                if (relationConfig?.table) {
                  const idField =
                    relationConfig.idField || relationConfig.column || c;
                  const idValue = normalizeSearchValue(
                    getRowValueCaseInsensitive(r, idField),
                  );
                  if (idValue !== undefined && idValue !== null && idValue !== '') {
                    const delimiter = String(idValue).includes('-') ? '-' : '_';
                    searchTerm = buildDelimitedSearchTerm(idValue, delimiter);
                  }
                }
                return (
                  <td
                    key={c}
                    style={style}
                    title={displayLines ? displayLines.join('\n') : raw}
                    onContextMenu={(e) => searchTerm && openContextMenu(e, searchTerm)}
                  >
                    {displayLines ? (
                      <div className="flex flex-col">
                        {displayLines.map((line, lineIdx) => (
                          <div key={`${c}-json-${lineIdx}`}>{line}</div>
                        ))}
                      </div>
                    ) : (
                      display
                    )}
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
                    const explicitRequestOnlyValue =
                      coalesce(
                        lockInfo,
                        'requires_request',
                        'require_request',
                        'request_only',
                        'force_request',
                      ) ??
                      coalesce(
                        r,
                        'requires_request',
                        'require_request',
                        'request_only',
                        'force_request',
                      );
                    const actionLocked =
                      locked || isTruthyFlag(explicitRequestOnlyValue);
                    if (!actionLocked) {
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
                    whiteSpace: 'nowrap',
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
        key={`rowform-${table}-${rowFormKey}`}
        visible={showForm}
        useGrid
        onCancel={() => {
          setRowFormKey((key) => key + 1);
          setShowForm(false);
          setEditing(null);
          setIsAdding(false);
          setGridRows([]);
          setRequestType(null);
          setPendingTemporaryPromotion(null);
          setTemporaryPromotionQueue([]);
          setActiveTemporaryDraftId(null);
          setForceResolvePendingDrafts(false);
          resetWorkflowState();
          if (supportsTemporary && showReviewActions) {
            setShowTemporaryModal(true);
          }
        }}
        onSubmit={handleSubmit}
        onSaveTemporary={temporarySaveEnabled ? handleSaveTemporary : null}
        onChange={handleFieldChange}
        columns={formColumns}
        row={editing}
        rows={gridRows}
        isEditingTemporaryDraft={isEditingTemporaryDraft}
        temporarySaveLabel={temporarySaveLabel}
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
        signatureFields={formConfig?.signatureFields || []}
        totalAmountFields={formConfig?.totalAmountFields || []}
        totalCurrencyFields={formConfig?.totalCurrencyFields || []}
        procTriggers={procTriggers}
        columnCaseMap={columnCaseMap}
        table={table}
        tableColumns={columnMeta}
        imagenameField={formConfig?.imagenameField || []}
        imageIdField={formConfig?.imageIdField || ''}
        imageConfigs={allConfigs}
        viewSource={viewSourceMap}
        viewDisplays={viewDisplayMap}
        viewColumns={viewColumns}
        onRowsChange={handleRowsChange}
        autoFillSession={autoFillSession}
        scope="forms"
        allowTemporarySave={temporarySaveEnabled}
        readOnly={isTemporaryReadOnlyMode}
        allowImageActions={isTemporaryReviewMode}
        isAdding={isAdding}
        canPost={canPostTransactions}
        allowTemporaryOnly={allowTemporaryOnly}
        forceEditable={guardOverridesActive}
        extraFooterContent={forceResolveFooterContent}
        posApiEnabled={posApiEnabled}
        posApiTypeField={formConfig?.posApiTypeField || ''}
        posApiEndpointMeta={formConfig?.posApiEndpointMeta || null}
        posApiInfoEndpointMeta={formConfig?.posApiInfoEndpointMeta || []}
        posApiInfoEndpointConfig={formConfig?.infoEndpointConfig || {}}
        posApiReceiptTypes={formConfig?.posApiReceiptTypes || []}
        posApiPaymentMethods={formConfig?.posApiPaymentMethods || []}
      />
      {printModalOpen && (
        <Modal
          visible={printModalOpen}
          title={t('print', 'Print')}
          onClose={closePrintModal}
          width="420px"
        >
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={printEmpSelected}
                  onChange={(e) => setPrintEmpSelected(e.target.checked)}
                />
                <span>{t('printEmp', 'Print Emp')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={printCustSelected}
                  onChange={(e) => setPrintCustSelected(e.target.checked)}
                />
                <span>{t('printCust', 'Print Cust')}</span>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span className="min-w-[80px]">{t('copies', 'Copies')}</span>
              <input
                type="number"
                min="1"
                step="1"
                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                value={printCopies}
                onChange={(e) => setPrintCopies(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 bg-gray-200 rounded"
                onClick={closePrintModal}
              >
                {t('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-60"
                onClick={confirmPrintSelection}
                disabled={!printEmpSelected && !printCustSelected}
              >
                {t('print', 'Print')}
              </button>
            </div>
          </div>
        </Modal>
      )}
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
        configs={allConfigs}
        currentConfig={formConfig}
        currentConfigName={formName}
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
        currentConfig={formConfig}
        currentConfigName={formName}
        canDelete={Boolean(normalizedViewerEmpId)}
        useAllConfigsWhenMissing
      />
      <RowImageViewModal
        visible={temporaryImagesEntry !== null}
        onClose={() => setTemporaryImagesEntry(null)}
        table={temporaryImagesEntry?.table || table}
        folder={getImageFolder(temporaryImagesEntry?.row || {})}
        row={temporaryImagesEntry?.row || {}}
        columnCaseMap={columnCaseMap}
        configs={allConfigs}
        currentConfig={formConfig}
        currentConfigName={formName}
        canDelete={Boolean(temporaryImagesEntry?.canDelete)}
        useAllConfigsWhenMissing
      />
      <RowImageUploadModal
        visible={temporaryUploadEntry !== null}
        onClose={() => setTemporaryUploadEntry(null)}
        table={temporaryUploadEntry?.table || table}
        folder={getImageFolder(temporaryUploadEntry?.row || {})}
        row={temporaryUploadEntry?.row || {}}
        rowKey={temporaryUploadEntry?.id || 0}
        imagenameFields={temporaryUploadEntry?.config?.imagenameField || []}
        columnCaseMap={columnCaseMap}
        imageIdField={temporaryUploadEntry?.config?.imageIdField || ''}
        configs={allConfigs}
        currentConfig={formConfig}
        currentConfigName={formName}
        forceTemporary
        onUploaded={async (name) => {
          if (!temporaryUploadEntry) return;
          const targetId = temporaryUploadEntry.id;
          if (targetId) {
            setTemporaryList((prev) =>
              prev.map((entry) =>
                getTemporaryId(entry) === targetId
                  ? {
                      ...entry,
                      _imageName: name,
                      imageName: name,
                      image_name: name,
                    }
                  : entry,
              ),
            );
            try {
              const res = await fetch(
                `${API_BASE}/transaction_temporaries/${encodeURIComponent(targetId)}/image`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ imageName: name }),
                },
              );
              const rateLimitMessage = await getRateLimitMessage(res);
              if (rateLimitMessage) {
                addToast(rateLimitMessage, 'warning');
                return;
              }
              if (!res.ok) {
                throw new Error('Failed to persist temporary image name');
              }
            } catch (err) {
              console.error('Failed to persist temporary image name', err);
              addToast(
                t(
                  'temporary_image_name_save_failed',
                  'Failed to save temporary image name',
                ),
                'error',
              );
            }
          }
          setTemporaryUploadEntry((prev) =>
            prev
              ? {
                  ...prev,
                  row: {
                    ...prev.row,
                    _imageName: name,
                    imageName: name,
                    image_name: name,
                  },
                }
              : prev,
          );
        }}
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
            {temporaryTabs.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                {temporaryTabs.map((tab) => {
                  const isActive = temporaryScope === tab.scope;
                  const count = Number(tab.count ?? 0);
                  return (
                    <button
                      key={tab.scope}
                      type="button"
                      onClick={() => fetchTemporaryList(tab.scope)}
                      disabled={isActive}
                      style={{
                        padding: '0.35rem 0.75rem',
                        backgroundColor: isActive ? '#2563eb' : '#e5e7eb',
                        color: isActive ? '#fff' : '#111827',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isActive ? 'default' : 'pointer',
                      }}
                    >
                      {tab.label}
                      {count > 0 ? ` (${count})` : ''}
                    </button>
                  );
                })}
              </div>
            )}
            {canSelectTemporaries && temporaryList.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                  {t('temporary_selected_count', '{{count}} selected', {
                    count: temporarySelection.size,
                  })}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={promoteTemporarySelection}
                    disabled={!hasReviewSelection}
                    style={{
                      padding: '0.35rem 0.75rem',
                      backgroundColor: hasReviewSelection ? '#16a34a' : '#d1d5db',
                      color: hasReviewSelection ? '#fff' : '#6b7280',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: hasReviewSelection ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {t('temporary_promote_selected', 'Promote selected')}
                  </button>
                  <button
                    type="button"
                    onClick={clearTemporarySelection}
                    disabled={!hasReviewSelection}
                    style={{
                      padding: '0.35rem 0.75rem',
                      backgroundColor: '#e5e7eb',
                      color: '#111827',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: hasReviewSelection ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {t('temporary_clear_selection', 'Clear selection')}
                  </button>
                </div>
              </div>
            )}
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
                      {canSelectTemporaries && (
                        <th
                          style={{
                            borderBottom: '1px solid #d1d5db',
                            textAlign: 'center',
                            padding: '0.25rem',
                            width: '3rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            disabled={pendingReviewIds.length === 0}
                            checked={pendingReviewIds.length > 0 && allReviewSelected}
                            onChange={(e) => toggleTemporarySelectAll(e.target.checked)}
                          />
                        </th>
                      )}
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>
                        {t('table', 'Table')}
                      </th>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>
                        {t('created_by', 'Created by')}
                      </th>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>
                        {t('status', 'Status')}
                      </th>
                      <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>
                        {t('created_at', 'Created at')}
                      </th>
                        <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '0.25rem' }}>
                          {t('details', 'Details')}
                        </th>
                        {showCreatorActions && (
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
                        {showReviewActions && (
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
                    {temporaryList.map((entry, index) => {
                      const entryId = getTemporaryId(entry);
                      const rowKey = entryId ?? `row-${index}`;
                      const isFocused = temporaryFocusId && rowKey === temporaryFocusId;
                      const isActiveDraft =
                        activeTemporaryDraftId &&
                        entryId != null &&
                        String(entryId) === String(activeTemporaryDraftId);
                      const statusRaw = entry?.status
                        ? String(entry.status).trim().toLowerCase()
                        : '';
                      const isPendingStatus = statusRaw === 'pending' || statusRaw === '';
                      const statusLabel = isPendingStatus
                        ? t('temporary_pending_status', 'Pending')
                        : statusRaw === 'promoted'
                        ? t('temporary_promoted_short', 'Promoted')
                        : statusRaw === 'forwarded'
                        ? t('temporary_forwarded_short', 'Forwarded')
                        : statusRaw === 'rejected'
                        ? t('temporary_rejected_short', 'Rejected')
                        : entry?.status || '-';
                      const statusColor = statusRaw === 'rejected'
                        ? '#b91c1c'
                        : statusRaw === 'promoted'
                        ? '#15803d'
                        : statusRaw === 'forwarded'
                        ? '#2563eb'
                        : '#1f2937';
                      const reviewNotes = entry?.reviewNotes || entry?.review_notes || '';
                      const reviewedAt = entry?.reviewedAt || entry?.reviewed_at || null;
                      const reviewedBy = entry?.reviewedBy || entry?.reviewed_by || '';
                      const { values: normalizedValues } = buildTemporaryFormState(entry);
                      const imageConfig =
                        getImageConfigForRow({ ...normalizedValues, ...entry }, formConfig || {});
                      const promotedRecordId =
                        entry?.promotedRecordId ||
                        entry?.promoted_record_id ||
                        entry?.recordId ||
                        entry?.record_id ||
                        null;
                      const resolvedImageValues = {
                        ...normalizedValues,
                        ...entry,
                      };
                      if (
                        promotedRecordId &&
                        imageConfig?.imageIdField &&
                        (resolvedImageValues[imageConfig.imageIdField] == null ||
                          resolvedImageValues[imageConfig.imageIdField] === '')
                      ) {
                        resolvedImageValues[imageConfig.imageIdField] = promotedRecordId;
                      }
                      const entryImageName =
                        entry?._imageName ||
                        entry?.imageName ||
                        entry?.image_name ||
                        resolveImageNameForRow(resolvedImageValues, imageConfig);
                      const normalizedValuesWithImage = {
                        ...normalizedValues,
                        ...(entryImageName
                          ? {
                              _imageName:
                                normalizedValues?._imageName || entryImageName,
                              imageName: normalizedValues?.imageName || entryImageName,
                              image_name: normalizedValues?.image_name || entryImageName,
                            }
                          : {}),
                      };
                      if (
                        promotedRecordId &&
                        imageConfig?.imageIdField &&
                        (normalizedValuesWithImage[imageConfig.imageIdField] == null ||
                          normalizedValuesWithImage[imageConfig.imageIdField] === '')
                      ) {
                        normalizedValuesWithImage[imageConfig.imageIdField] =
                          promotedRecordId;
                      }
                      const hasTemporaryImageName = Boolean(entryImageName);
                      const temporaryTableName =
                        entry?.tableName || entry?.table_name || table;
                      const temporaryImageName = entryImageName || '';
                      const canViewTemporaryImages =
                        (Array.isArray(imageConfig?.imagenameField) &&
                          imageConfig.imagenameField.length > 0) ||
                        Boolean(imageConfig?.imageIdField) ||
                        hasTemporaryImageName;
                      const canUploadTemporaryImages = true;
                      const canDeleteTemporaryImages = Boolean(normalizedViewerEmpId);
                      const detailColumns = temporaryDetailColumns;
                      const rowBackgroundColor = isFocused
                        ? '#fef9c3'
                        : isActiveDraft
                        ? '#e0f2fe'
                        : 'transparent';
                      const shouldRenderDetailHeader =
                        !detailHeaderRendered && detailColumns.length > 0;
                      if (shouldRenderDetailHeader) {
                        detailHeaderRendered = true;
                      }
                      return (
                        <tr
                          key={rowKey}
                          ref={(node) => setTemporaryRowRef(rowKey, node)}
                          style={{
                            backgroundColor: rowBackgroundColor,
                            transition: 'background-color 0.2s ease-in-out',
                            borderLeft: isActiveDraft ? '4px solid #2563eb' : '4px solid transparent',
                          }}
                        >
                          <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              {(isFocused || isActiveDraft) && (
                                <span
                                  style={{
                                    color: isFocused ? '#b45309' : '#2563eb',
                                    fontSize: '0.9rem',
                                  }}
                                  title={
                                    isFocused
                                      ? t(
                                          'temporary_highlight',
                                          'Recently opened from notifications',
                                        )
                                      : t(
                                          'temporary_active_draft',
                                          'Currently editing this temporary draft',
                                        )
                                  }
                                >
                                  ★
                                </span>
                              )}
                              <span>{entry?.id ?? index + 1}</span>
                            </div>
                          </td>
                          {canSelectTemporaries && (
                            <td
                              style={{
                                borderBottom: '1px solid #f3f4f6',
                                padding: '0.25rem',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                disabled={!entryId || entry?.status !== 'pending'}
                                checked={!!entryId && temporarySelection.has(entryId)}
                                onChange={() => toggleTemporarySelection(entryId)}
                              />
                            </td>
                          )}
                          <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>
                            <div style={{ fontWeight: 600 }}>
                              {entry?.formLabel || entry?.formName || '-'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#4b5563' }}>{entry?.tableName}</div>
                          </td>
                          <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>
                            {entry?.createdBy}
                          </td>
                            <td
                              style={{
                                borderBottom: '1px solid #f3f4f6',
                                padding: '0.25rem',
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: statusColor,
                                  textTransform: 'capitalize',
                                }}
                              >
                                {statusLabel}
                              </div>
                              <div style={{ marginTop: '0.35rem' }}>
                                {entryId ? (
                                  <button
                                    type="button"
                                    onClick={() => openTemporaryChainModal(entry)}
                                    style={{
                                      padding: '0.25rem 0.55rem',
                                      backgroundColor: '#f3f4f6',
                                      color: '#1f2937',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    {t(
                                      'temporary_view_chain',
                                      'View review chain & timeline',
                                    )}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                    {t(
                                      'temporary_view_chain_unavailable',
                                      'Chain details unavailable for this row.',
                                    )}
                                  </span>
                                )}
                              </div>
                              {!isPendingStatus && reviewedAt && (
                                <div style={{ fontSize: '0.75rem', color: '#4b5563' }}>
                                  {t('temporary_reviewed_at', 'Reviewed')}: {formatTimestamp(reviewedAt)}
                                </div>
                              )}
                              {!isPendingStatus && reviewedBy && (
                                <div style={{ fontSize: '0.75rem', color: '#4b5563' }}>
                                  {t('temporary_reviewed_by', 'Reviewed by')}: {reviewedBy}
                                </div>
                              )}
                              {!isPendingStatus && reviewNotes && (
                                <div
                                  style={{
                                    marginTop: '0.35rem',
                                    padding: '0.35rem',
                                    backgroundColor:
                                      statusRaw === 'rejected' ? '#fee2e2' : '#ecfdf5',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.75rem',
                                    color: '#1f2937',
                                    whiteSpace: 'pre-wrap',
                                  }}
                                >
                                  <strong style={{ display: 'block', marginBottom: '0.2rem' }}>
                                    {t('temporary_review_notes', 'Review notes')}
                                  </strong>
                                  {reviewNotes}
                                </div>
                              )}
                            </td>
                            <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>
                              {formatTimestamp(entry?.createdAt)}
                            </td>
                            <td style={{ borderBottom: '1px solid #f3f4f6', padding: '0.25rem' }}>
                            {detailColumns.length === 0 ? (
                              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                {t(
                                  'temporary_no_visible_fields',
                                  'No visible fields configured for this form.',
                                )}
                              </span>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table
                                  style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                  }}
                                >
                                  {shouldRenderDetailHeader && (
                                    <thead>
                                      <tr>
                                        {detailColumns.map((col) => (
                                          <th
                                            key={col}
                                            style={{
                                              borderBottom: '1px solid #e5e7eb',
                                              padding: '0.25rem',
                                              textAlign: 'left',
                                              fontSize: '0.75rem',
                                            }}
                                          >
                                            {labels[col] || col}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                  )}
                                  <tbody>
                                    <tr>
                                      {detailColumns.map((col) => (
                                        <td
                                          key={col}
                                          style={{
                                            borderBottom: '1px solid #f3f4f6',
                                            padding: '0.25rem',
                                            fontSize: '0.75rem',
                                          }}
                                        >
                                          {formatTemporaryFieldValue(col, normalizedValues[col])}
                                        </td>
                                      ))}
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              )}
                              {(canViewTemporaryImages || canUploadTemporaryImages) && (
                                <div
                                  style={{
                                    marginTop: '0.35rem',
                                    display: 'flex',
                                    gap: '0.35rem',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  {canUploadTemporaryImages && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTemporaryUploadEntry({
                                          id: entryId,
                                          row: {
                                            ...normalizedValuesWithImage,
                                            _imageName:
                                              normalizedValuesWithImage?._imageName ||
                                              temporaryImageName,
                                            imageName:
                                              normalizedValuesWithImage?.imageName ||
                                              temporaryImageName,
                                            image_name:
                                              normalizedValuesWithImage?.image_name ||
                                              temporaryImageName,
                                            created_by: entry?.created_by || entry?.createdBy,
                                          },
                                          table: temporaryTableName,
                                          config: imageConfig,
                                        })
                                      }
                                      style={{
                                        padding: '0.25rem 0.55rem',
                                        backgroundColor: '#e0f2fe',
                                        color: '#0369a1',
                                        border: '1px solid #bae6fd',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                      }}
                                    >
                                      {t('upload_images', 'Upload Images')}
                                    </button>
                                  )}
                                  {canViewTemporaryImages && !showReviewActions && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const rowWithImage = {
                                          ...normalizedValuesWithImage,
                                          _imageName:
                                            normalizedValuesWithImage?._imageName ||
                                            temporaryImageName,
                                          imageName:
                                            normalizedValuesWithImage?.imageName ||
                                            temporaryImageName,
                                          image_name:
                                            normalizedValuesWithImage?.image_name ||
                                            temporaryImageName,
                                          created_by: entry?.created_by || entry?.createdBy,
                                        };
                                        showImageSearchToast(rowWithImage, temporaryTableName);
                                        setTemporaryImagesEntry({
                                          row: rowWithImage,
                                          table: temporaryTableName,
                                          canDelete: canDeleteTemporaryImages,
                                        });
                                      }}
                                      style={{
                                        padding: '0.25rem 0.55rem',
                                        backgroundColor: '#f3f4f6',
                                        color: '#1f2937',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                      }}
                                    >
                                      {t('view_images', 'View images')}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            {showCreatorActions && (
                              <td
                                style={{
                                  borderBottom: '1px solid #f3f4f6',
                                  padding: '0.25rem',
                                  textAlign: 'right',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {statusRaw === 'rejected' ? (
                                  <button
                                    type="button"
                                    onClick={() => openTemporaryDraft(entry)}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      backgroundColor: '#2563eb',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {t('temporary_edit_rejected', 'Edit & resubmit')}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>—</span>
                                )}
                              </td>
                            )}
                            {showReviewActions && (
                              <td
                                style={{
                                  borderBottom: '1px solid #f3f4f6',
                                  padding: '0.25rem',
                                textAlign: 'right',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {entry?.status === 'pending' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openTemporaryPromotion(entry)}
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
                                  {entry?.status === 'promoted'
                                    ? t('temporary_promoted_short', 'Promoted')
                                    : t('temporary_rejected_short', 'Rejected')}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
      <Modal
        visible={temporaryChainModalVisible}
        onClose={closeTemporaryChainModal}
        title={
          temporaryChainModalData?.formLabel
            ? t('temporary_chain_modal_title', 'Review chain: {{form}}', {
                form: temporaryChainModalData.formLabel,
              })
            : t('temporary_chain_modal_generic', 'Review chain')
        }
        width="70vw"
      >
        {temporaryChainModalLoading ? (
          <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>
            {t('temporary_chain_loading', 'Loading review chain…')}
          </p>
        ) : temporaryChainModalError ? (
          <p style={{ fontSize: '0.9rem', color: '#b91c1c' }}>
            {temporaryChainModalError}
          </p>
        ) : temporaryChainModalData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  background: '#f3f4f6',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.75rem',
                  minWidth: '12rem',
                }}
              >
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                  {t('temporary_chain_length', 'Total reviewers')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {temporaryChainStats.length}
                </div>
              </div>
              <div
                style={{
                  background: '#ecfdf3',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.75rem',
                  minWidth: '12rem',
                }}
              >
                <div style={{ color: '#047857', fontSize: '0.8rem' }}>
                  {t('temporary_chain_completed', 'Completed')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#065f46' }}>
                  {temporaryChainStats.completedCount}
                </div>
              </div>
              <div
                style={{
                  background: '#fff7ed',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.75rem',
                  minWidth: '12rem',
                }}
              >
                <div style={{ color: '#b45309', fontSize: '0.8rem' }}>
                  {t('temporary_chain_pending', 'Pending reviewers')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#b45309' }}>
                          {temporaryChainStats.pendingCount}
                        </div>
                        {temporaryChainStats.currentReviewer && (
                          <div style={{ fontSize: '0.8rem', color: '#92400e' }}>
                            {t('temporary_chain_current_reviewer', 'Current reviewer')}: {temporaryChainStats.currentReviewer}
                          </div>
                        )}
                      </div>
                    </div>
            <div>
              <h4 style={{ marginBottom: '0.5rem' }}>
                {t('temporary_chain_steps', 'Review steps')}
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: '600px',
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.5rem' }}>
                        {t('temporary_step', 'Step')}
                      </th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.5rem' }}>
                        {t('created_by', 'Created by')}
                      </th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.5rem' }}>
                        {t('temporary_reviewer', 'Reviewer')}
                      </th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.5rem' }}>
                        {t('temporary_action', 'Action')}
                      </th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.5rem' }}>
                        {t('temporary_review_notes', 'Review notes')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
            {temporaryChainView.chain.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '0.75rem', color: '#6b7280' }}>
                  {t('temporary_chain_empty', 'No review chain information available.')}
                </td>
              </tr>
            ) : (
              temporaryChainView.chain.map((row, idx) => {
                const normalizedStatus = (row?.status || '')
                  .toString()
                  .trim()
                          .toLowerCase();
                        const statusLabel =
                          normalizedStatus === 'pending'
                            ? t('temporary_pending_status', 'Pending')
                            : normalizedStatus === 'promoted'
                            ? t('temporary_promoted_short', 'Promoted')
                            : normalizedStatus === 'forwarded'
                            ? t('temporary_forwarded_short', 'Forwarded')
                            : normalizedStatus === 'rejected'
                            ? t('temporary_rejected_short', 'Rejected')
                            : row?.status || '-';
                        const temporaryId =
                          row?.temporaryId || row?.temporary_id || row?.temporaryid || row?.id;
                        const creator = row?.createdBy || row?.created_by || '—';
                        const reviewerList = normalizePlanSeniorList(
                          row?.planSeniorEmpIds ??
                            row?.planSeniorEmpId ??
                            row?.plan_senior_empid ??
                            row?.plan_senior_emp_id ??
                            row?.planSeniorEmpID ??
                            row?.reviewerEmpIds ??
                            row?.reviewerEmpId ??
                            row?.reviewer_emp_id,
                        );
                        const reviewer =
                          reviewerList.length > 0
                            ? reviewerList.join(', ')
                            : row?.reviewer || '—';
                        const latestReview =
                          temporaryId && latestTemporaryReviewById.get(temporaryId);
                        const actionLabel = latestReview?.action
                          ? latestReview.action
                          : statusLabel;
                        const actionNotes = row?.reviewNotes || row?.review_notes;
                        const actionTimestamp =
                          latestReview?.createdAt ||
                          row?.reviewedAt ||
                          row?.reviewed_at ||
                          null;
                        const actionActor =
                          latestReview?.reviewer ||
                          row?.reviewedBy ||
                          row?.reviewed_by ||
                          reviewer;
                        const rowKey = row?.id || idx;
                        return (
                          <tr key={`chain-${rowKey}`}>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                              {idx + 1}
                            </td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                              {creator}
                            </td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                              {reviewer}
                            </td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ fontWeight: 600 }}>{actionLabel || '—'}</div>
                              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                {actionActor || '—'}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                {actionTimestamp
                                  ? formatTimestamp(actionTimestamp)
                                  : '—'}
                              </div>
                            </td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                              {actionNotes ? (
                                <div style={{ whiteSpace: 'pre-wrap' }}>{actionNotes}</div>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 style={{ marginBottom: '0.5rem' }}>
                {t('temporary_chain_history', 'Action timeline')}
              </h4>
              {temporaryChainView.reviewHistory.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  {t('temporary_chain_history_empty', 'No actions have been recorded yet.')}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {temporaryChainView.reviewHistory.map((item) => (
                    <li
                      key={`history-${item.id || `${item.temporaryId}-${item.createdAt}`}`}
                      style={{
                        padding: '0.75rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.75rem',
                        marginBottom: '0.5rem',
                        background: '#f9fafb',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        {item.action ? item.action.toUpperCase() : t('temporary_action', 'Action')}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                        {t('temporary_reviewer', 'Reviewer')}: {item.reviewerEmpId || '—'}
                      </div>
                      {item.forwardedToEmpId && (
                        <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                          {t('temporary_forward_to', 'Forwarded to')}: {item.forwardedToEmpId}
                        </div>
                      )}
                      {item.promotedRecordId && (
                        <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                          {t('temporary_promoted_record', 'Promoted record ID')}: {item.promotedRecordId}
                        </div>
                      )}
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        {item.createdAt ? formatTimestamp(item.createdAt) : '—'}
                      </div>
                      {item.notes && (
                        <div style={{
                          marginTop: '0.35rem',
                          padding: '0.5rem',
                          background: '#fff',
                          borderRadius: '0.5rem',
                          color: '#1f2937',
                          whiteSpace: 'pre-wrap',
                          border: '1px solid #e5e7eb',
                        }}>
                          {item.notes}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {temporaryChainStats.lastUpdated && (
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {t('temporary_chain_last_updated', 'Last updated')}: {formatTimestamp(temporaryChainStats.lastUpdated)}
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>
            {t('temporary_chain_empty', 'No review chain information available.')}
          </p>
        )}
      </Modal>
      <Modal
        visible={Boolean(temporaryValuePreview)}
        title={
          temporaryValuePreview?.title
            ? t('temporary_value_modal_title', '{{field}} details', {
                field: temporaryValuePreview.title,
              })
            : t('temporary_value_modal_generic', 'Temporary value details')
        }
        onClose={() => setTemporaryValuePreview(null)}
        width="80vw"
      >
        {temporaryValuePreview?.rows?.length ? (
          <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {temporaryValuePreview.columns.map((col) => (
                    <th
                      key={col}
                      style={{
                        position: 'sticky',
                        top: 0,
                        background: '#f9fafb',
                        borderBottom: '1px solid #d1d5db',
                        padding: '0.4rem',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {temporaryValuePreview.rows.map((row, rowIdx) => (
                  <tr key={`preview-row-${rowIdx}`}>
                    {temporaryValuePreview.columns.map((col) => (
                      <td
                        key={`${rowIdx}-${col}`}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          padding: '0.4rem',
                          fontSize: '0.8rem',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {row[col] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: '#4b5563' }}>
            {t('temporary_value_modal_empty', 'No data available for this field.')}
          </p>
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
              loadSearch(ctxMenu.term);
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
          zIndex: 2000,
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
                  body: JSON.stringify(labelEdits),
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

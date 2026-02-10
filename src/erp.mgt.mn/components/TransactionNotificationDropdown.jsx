import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useTransactionNotifications } from '../context/TransactionNotificationContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

const TRANSACTION_NAME_KEYS = [
  'UITransTypeName',
  'UITransTypeNameEng',
  'UITransTypeNameEN',
  'UITransTypeNameEn',
  'transactionName',
  'transaction_name',
  'name',
  'Name',
];
const TRANSACTION_TABLE_KEYS = [
  'transactionTable',
  'transaction_table',
  'table',
  'tableName',
  'table_name',
];
const DEFAULT_PLAN_NOTIFICATION_FIELDS = ['is_plan', 'is_plan_completion'];
const DEFAULT_PLAN_NOTIFICATION_VALUES = ['1'];
const DEFAULT_DUTY_NOTIFICATION_FIELDS = [];
const DEFAULT_DUTY_NOTIFICATION_VALUES = ['1'];
const DROPDOWN_CHUNK_SIZE = 20;

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function normalizeFieldName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeMatch(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function parseListValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function getRowValue(row, keys) {
  if (!row || typeof row !== 'object') return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return null;
}

function normalizeFlagValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return false;
    if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
    const num = Number(normalized);
    if (!Number.isNaN(num)) return num !== 0;
    return true;
  }
  return Boolean(value);
}

function getRowFieldValue(row, fieldName) {
  if (!row || !fieldName) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
    return row[fieldName];
  }
  const normalizedTarget = normalizeFieldName(fieldName);
  if (!normalizedTarget) return undefined;
  const matchKey = Object.keys(row).find(
    (key) => normalizeFieldName(key) === normalizedTarget,
  );
  return matchKey ? row[matchKey] : undefined;
}

function getActionMeta(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (normalized === 'excluded' || normalized === 'exclude') {
    return { label: 'Excluded', accent: '#ea580c' };
  }
  if (normalized === 'included' || normalized === 'include') {
    return { label: 'Included', accent: '#059669' };
  }
  if (normalized === 'deleted' || normalized === 'delete') {
    return { label: 'Deleted', accent: '#dc2626' };
  }
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return { label: 'Edited', accent: '#2563eb' };
  }
  if (normalized === 'changed' || normalized === 'change') {
    return { label: 'Changed', accent: '#d97706' };
  }
  if (normalized) {
    return { label: normalized.charAt(0).toUpperCase() + normalized.slice(1), accent: '#059669' };
  }
  return { label: 'New', accent: '#059669' };
}

function buildPreviewText(item) {
  if (!item) return 'Transaction update';
  if (item.summaryText) return item.summaryText;
  const meta = getActionMeta(item.action);
  if (meta.label === 'Deleted') return 'Transaction deleted';
  if (meta.label === 'Edited') return 'Transaction edited';
  if (meta.label === 'Changed') return 'Transaction changed';
  return 'Transaction update';
}

function getStatusMeta(status) {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (normalized === 'accepted') return { label: 'Approved', accent: '#16a34a' };
  if (normalized === 'declined') return { label: 'Rejected', accent: '#ef4444' };
  if (normalized === 'pending') return { label: 'Request', accent: '#f59e0b' };
  if (normalized) {
    return { label: normalized.charAt(0).toUpperCase() + normalized.slice(1), accent: '#2563eb' };
  }
  return { label: 'Request', accent: '#f59e0b' };
}

function getTemporaryStatusMeta(status) {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (['accepted', 'approved', 'promoted'].includes(normalized)) {
    return { label: 'Approval', accent: '#16a34a' };
  }
  if (['declined', 'rejected'].includes(normalized)) {
    return { label: 'Rejection', accent: '#ef4444' };
  }
  return { label: 'Request', accent: '#f59e0b' };
}

function dedupeRequests(list) {
  const map = new Map();
  list.forEach((item) => {
    if (!item || !item.request_id) return;
    if (!map.has(item.request_id)) {
      map.set(item.request_id, item);
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a?.created_at || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.created_at || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function createEmptyResponses() {
  return { accepted: [], declined: [] };
}

function formatRequestType(value) {
  if (!value) return 'Request';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRequester(req) {
  return req?.emp_name || req?.empid || req?.emp_id || '';
}

function getResponder(req) {
  return (
    req?.response_empid ||
    req?.responseEmpid ||
    req?.response_emp_id ||
    req?.responded_by ||
    ''
  );
}

function getTemporaryEntryKey(entry) {
  return String(
    entry?.id ??
      entry?.temporary_id ??
      entry?.temporaryId ??
      entry?.temporaryID ??
      '',
  ).trim();
}

function getNotificationTimestamp(notification) {
  if (!notification) return 0;
  const raw = notification.updatedAt || notification.createdAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function formatDisplayTimestamp(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatTimestamp(parsed);
}

function getRequestTimestamp(req, scope) {
  if (!req) return 0;
  if (scope === 'response') {
    const responseAt =
      req.responded_at || req.respondedAt || req.response_at || req.responseAt || req.updated_at;
    if (responseAt) {
      const parsed = new Date(responseAt).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  const raw =
    req.updated_at ||
    req.updatedAt ||
    req.created_at ||
    req.createdAt ||
    req.requested_at ||
    req.requestedAt ||
    0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function getTemporaryTimestamp(entry) {
  if (!entry) return 0;
  const raw =
    entry.updated_at ||
    entry.updatedAt ||
    entry.created_at ||
    entry.createdAt ||
    entry.submitted_at ||
    entry.submittedAt ||
    0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export default function TransactionNotificationDropdown() {
  const { notifications, unreadCount, markRead } = useTransactionNotifications();
  const { markWorkflowSeen, temporary } = usePendingRequests();
  const [open, setOpen] = useState(false);
  const [formEntries, setFormEntries] = useState([]);
  const [formsLoaded, setFormsLoaded] = useState(false);
  const [codeTransactions, setCodeTransactions] = useState([]);
  const [reportState, setReportState] = useState({
    incoming: [],
    outgoing: [],
    responses: createEmptyResponses(),
    loading: false,
    error: '',
  });
  const [changeState, setChangeState] = useState({
    incoming: [],
    outgoing: [],
    responses: createEmptyResponses(),
    loading: false,
    error: '',
  });
  const [temporaryState, setTemporaryState] = useState({
    review: [],
    created: [],
    loading: false,
    error: '',
  });
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [visibleCount, setVisibleCount] = useState(DROPDOWN_CHUNK_SIZE);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const generalConfig = useGeneralConfig();
  const dashboardTabs = useMemo(
    () => new Set(['general', 'activity', 'audition', 'plans']),
    [],
  );

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => getNotificationTimestamp(b) - getNotificationTimestamp(a),
      ),
    [notifications],
  );

  useEffect(() => {
    const handleClick = (event) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    let canceled = false;
    fetch('/api/tables/code_transaction?perPage=500', {
      credentials: 'include',
      skipErrorToast: true,
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => {
        if (canceled) return;
        setCodeTransactions(Array.isArray(data?.rows) ? data.rows : []);
      })
      .catch(() => {
        if (!canceled) setCodeTransactions([]);
      });
    return () => {
      canceled = true;
    };
  }, []);

  const planNotificationConfig = useMemo(() => {
    const fields = parseListValue(generalConfig?.plan?.notificationFields);
    const values = parseListValue(generalConfig?.plan?.notificationValues);
    return {
      fields: fields.length > 0 ? fields : DEFAULT_PLAN_NOTIFICATION_FIELDS,
      values: values.length > 0 ? values : DEFAULT_PLAN_NOTIFICATION_VALUES,
    };
  }, [generalConfig]);

  const dutyNotificationConfig = useMemo(() => {
    const fields = parseListValue(generalConfig?.plan?.dutyNotificationFields);
    const values = parseListValue(generalConfig?.plan?.dutyNotificationValues);
    return {
      fields: fields.length > 0 ? fields : DEFAULT_DUTY_NOTIFICATION_FIELDS,
      values: values.length > 0 ? values : DEFAULT_DUTY_NOTIFICATION_VALUES,
    };
  }, [generalConfig]);

  const isPlanNotificationRow = useCallback(
    (row) => {
      if (!row) return false;
      const normalizedValues = planNotificationConfig.values.map(normalizeMatch);
      return planNotificationConfig.fields.some((field) => {
        const value = getRowFieldValue(row, field);
        if (value === undefined || value === null || value === '') return false;
        if (normalizedValues.length === 0) return normalizeFlagValue(value);
        return normalizedValues.includes(normalizeMatch(value));
      });
    },
    [planNotificationConfig],
  );

  const isDutyNotificationRow = useCallback(
    (row) => {
      if (!row) return false;
      const normalizedValues = dutyNotificationConfig.values.map(normalizeMatch);
      return dutyNotificationConfig.fields.some((field) => {
        const value = getRowFieldValue(row, field);
        if (value === undefined || value === null || value === '') return false;
        if (normalizedValues.length === 0) return normalizeFlagValue(value);
        return normalizedValues.includes(normalizeMatch(value));
      });
    },
    [dutyNotificationConfig],
  );

  const planTransactionsByName = useMemo(() => {
    const map = new Map();
    codeTransactions.forEach((row) => {
      const name = normalizeText(getRowValue(row, TRANSACTION_NAME_KEYS));
      if (name) map.set(name, row);
      const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
      if (table) map.set(`table:${table}`, row);
    });
    return map;
  }, [codeTransactions]);

  const findTransactionRow = useCallback(
    (item) => {
      if (!item) return null;
      const nameKey = normalizeText(item.transactionName);
      if (nameKey && planTransactionsByName.has(nameKey)) {
        return planTransactionsByName.get(nameKey);
      }
      const tableKey = normalizeText(item.transactionTable);
      if (tableKey && planTransactionsByName.has(`table:${tableKey}`)) {
        return planTransactionsByName.get(`table:${tableKey}`);
      }
      return null;
    },
    [planTransactionsByName],
  );

  const isPlanNotificationItem = useCallback(
    (item) => {
      if (!item) return false;
      const row = findTransactionRow(item);
      return isPlanNotificationRow(row);
    },
    [findTransactionRow, isPlanNotificationRow],
  );

  const isDutyNotificationItem = useCallback(
    (item) => {
      if (!item) return false;
      const row = findTransactionRow(item);
      return isDutyNotificationRow(row);
    },
    [findTransactionRow, isDutyNotificationRow],
  );

  useEffect(() => {
    if (!open) return () => {};
    let cancelled = false;
    setInitialLoadComplete(false);

    const buildRequestState = (rows, requestTypes) => {
      const incoming = [];
      const outgoing = [];
      const accepted = [];
      const declined = [];
      const allowedTypes = new Set(requestTypes);
      rows.forEach((row) => {
        if (!allowedTypes.has(row?.request_type)) return;
        const status = String(row?.status || 'pending').trim().toLowerCase();
        if (row?.scope === 'incoming' && status === 'pending') {
          incoming.push(row);
          return;
        }
        if (status === 'pending') {
          outgoing.push(row);
          return;
        }
        if (status === 'accepted') {
          accepted.push(row);
          return;
        }
        if (status === 'declined') {
          declined.push(row);
        }
      });

      return {
        incoming: dedupeRequests(incoming),
        outgoing: dedupeRequests(outgoing),
        responses: {
          accepted: dedupeRequests(accepted),
          declined: dedupeRequests(declined),
        },
      };
    };

    const loadDropdownData = async () => {
      setReportState((prev) => ({ ...prev, loading: true, error: '' }));
      setChangeState((prev) => ({ ...prev, loading: true, error: '' }));
      setTemporaryState((prev) => ({ ...prev, loading: true, error: '' }));

      const feedPromise = fetch(
        '/api/pending_request/feed?status=pending,accepted,declined&request_type=report_approval,edit,delete&per_page=300&page=1',
        {
          credentials: 'include',
          skipLoader: true,
        },
      ).then(async (res) => {
        if (!res.ok) throw new Error('feed_failed');
        const data = await res.json().catch(() => ({}));
        return Array.isArray(data?.rows) ? data.rows : [];
      });

      const temporaryPromise = (async () => {
        if (typeof temporary?.fetchScopeEntries !== 'function') {
          return { review: [], created: [] };
        }
        const [reviewResult, createdResult] = await Promise.all([
          temporary.fetchScopeEntries('review', { limit: 50, status: 'pending' }),
          temporary.fetchScopeEntries('created', { limit: 50, status: 'any' }),
        ]);
        return {
          review: Array.isArray(reviewResult?.rows) ? reviewResult.rows : [],
          created: Array.isArray(createdResult?.rows) ? createdResult.rows : [],
        };
      })();

      const [feedResult, temporaryResult] = await Promise.allSettled([
        feedPromise,
        temporaryPromise,
      ]);

      if (cancelled) return;

      if (feedResult.status === 'fulfilled') {
        const rows = feedResult.value;
        const reportData = buildRequestState(rows, ['report_approval']);
        const changeData = buildRequestState(rows, ['edit', 'delete']);
        setReportState({ ...reportData, loading: false, error: '' });
        setChangeState({ ...changeData, loading: false, error: '' });
      } else {
        setReportState({
          incoming: [],
          outgoing: [],
          responses: createEmptyResponses(),
          loading: false,
          error: 'Failed to load report approvals',
        });
        setChangeState({
          incoming: [],
          outgoing: [],
          responses: createEmptyResponses(),
          loading: false,
          error: 'Failed to load change requests',
        });
      }

      if (temporaryResult.status === 'fulfilled') {
        setTemporaryState({
          review: temporaryResult.value.review,
          created: temporaryResult.value.created,
          loading: false,
          error: '',
        });
      } else {
        setTemporaryState({
          review: [],
          created: [],
          loading: false,
          error: 'Failed to load temporary transactions',
        });
      }

      setInitialLoadComplete(true);
    };

    loadDropdownData();
    return () => {
      cancelled = true;
    };
  }, [open, temporary?.fetchScopeEntries]);

  const openRequest = useCallback(
    (req, tab, statusOverride) => {
      setOpen(false);
      const params = new URLSearchParams();
      params.set('tab', tab);
      const normalizedStatus = statusOverride
        ? String(statusOverride).trim().toLowerCase()
        : 'pending';
      if (normalizedStatus) params.set('status', normalizedStatus);
      if (req?.request_type) params.set('requestType', req.request_type);
      if (req?.table_name) params.set('table_name', req.table_name);
      const createdAt = req?.created_at || req?.createdAt;
      let createdDate = '';
      if (createdAt) {
        const parsed = new Date(createdAt);
        if (!Number.isNaN(parsed.getTime())) {
          createdDate = formatTimestamp(parsed).slice(0, 10);
        } else if (typeof createdAt === 'string') {
          const match = createdAt.match(/^(\d{4}-\d{2}-\d{2})/);
          if (match) {
            createdDate = match[1];
          }
        }
      }
      if (createdDate) {
        params.set('date_from', createdDate);
        params.set('date_to', createdDate);
      }
      params.set('requestId', req?.request_id);
      if (typeof markWorkflowSeen === 'function') {
        const workflowKey =
          req?.request_type === 'report_approval' ? 'report_approval' : 'change_requests';
        const scope = tab === 'incoming' ? 'incoming' : 'outgoing';
        markWorkflowSeen(workflowKey, scope, [normalizedStatus]);
      }
      navigate(`/requests?${params.toString()}`);
    },
    [markWorkflowSeen, navigate],
  );

  const openTemporary = useCallback(
    (scope, entry) => {
      setOpen(false);
      temporary?.markScopeSeen?.(scope);
      if (!entry) {
        navigate('/forms');
        return;
      }
      const params = new URLSearchParams();
      params.set('temporaryOpen', '1');
      if (scope) params.set('temporaryScope', scope);
      params.set('temporaryKey', String(Date.now()));
      const moduleKey = entry?.moduleKey || entry?.module_key || '';
      let path = '/forms';
      if (moduleKey) {
        params.set('temporaryModule', moduleKey);
        path = `/forms/${moduleKey.replace(/_/g, '-')}`;
      }
      const configName = entry?.configName || entry?.config_name || '';
      const formName = entry?.formName || entry?.form_name || configName;
      if (formName) params.set('temporaryForm', formName);
      if (configName && configName !== formName) {
        params.set('temporaryConfig', configName);
      }
      const tableName = entry?.tableName || entry?.table_name || '';
      if (tableName) params.set('temporaryTable', tableName);
      const idValue = entry?.id ?? entry?.temporary_id ?? entry?.temporaryId ?? null;
      if (idValue != null) params.set('temporaryId', String(idValue));
      navigate(`${path}?${params.toString()}`);
    },
    [navigate, temporary?.markScopeSeen],
  );

  const reportItems = useMemo(() => {
    const items = [];
    reportState.incoming.forEach((req) => {
      items.push({ req, tab: 'incoming', status: 'pending', scope: 'incoming' });
    });
    reportState.outgoing.forEach((req) => {
      items.push({
        req,
        tab: 'outgoing',
        status: req?.status || 'pending',
        scope: 'outgoing',
      });
    });
    reportState.responses?.accepted?.forEach((req) => {
      items.push({ req, tab: 'outgoing', status: 'accepted', scope: 'response' });
    });
    reportState.responses?.declined?.forEach((req) => {
      items.push({ req, tab: 'outgoing', status: 'declined', scope: 'response' });
    });
    return items;
  }, [reportState.incoming, reportState.outgoing, reportState.responses]);

  const changeItems = useMemo(() => {
    const items = [];
    changeState.incoming.forEach((req) => {
      items.push({ req, tab: 'incoming', status: 'pending', scope: 'incoming' });
    });
    changeState.outgoing.forEach((req) => {
      items.push({
        req,
        tab: 'outgoing',
        status: req?.status || 'pending',
        scope: 'outgoing',
      });
    });
    changeState.responses?.accepted?.forEach((req) => {
      items.push({ req, tab: 'outgoing', status: 'accepted', scope: 'response' });
    });
    changeState.responses?.declined?.forEach((req) => {
      items.push({ req, tab: 'outgoing', status: 'declined', scope: 'response' });
    });
    return items;
  }, [changeState.incoming, changeState.outgoing, changeState.responses]);

  const temporaryItems = useMemo(
    () => [
      ...temporaryState.review.map((entry) => ({ entry, scope: 'review' })),
      ...temporaryState.created.map((entry) => ({ entry, scope: 'created' })),
    ],
    [temporaryState.created, temporaryState.review],
  );

  const resolveFormInfo = useCallback(
    (item) => {
      if (!item || formEntries.length === 0) return null;
      const normalizedName = normalizeText(item.transactionName);
      if (normalizedName) {
        const found = formEntries.find(([name]) => normalizeText(name) === normalizedName);
        if (found) return found[1];
      }
      const normalizedTable = normalizeText(item.transactionTable);
      if (normalizedTable) {
        const found = formEntries.find(([, info]) => {
          const table = normalizeText(info?.table ?? info?.tableName ?? info?.table_name);
          return table && table === normalizedTable;
        });
        if (found) return found[1];
      }
      return null;
    },
    [formEntries],
  );

  const handleNotificationClick = async (item) => {
    if (!item) return;
    setOpen(false);
    await markRead([item.id]);
    const formInfo = resolveFormInfo(item);
    const notifyFieldsRaw =
      formInfo?.notifyFields ?? formInfo?.notify_fields ?? [];
    const notifyFields = Array.isArray(notifyFieldsRaw)
      ? notifyFieldsRaw.map((field) => String(field).trim()).filter(Boolean)
      : [];
    const redirectTab = String(
      formInfo?.notificationRedirectTab ?? formInfo?.notification_redirect_tab ?? '',
    ).trim();
    const groupKey = encodeURIComponent(item.transactionName || 'Transaction');
    const defaultTab =
      isPlanNotificationItem(item) || isDutyNotificationItem(item) ? 'plans' : 'activity';
    const tab =
      notifyFields.length > 0 && dashboardTabs.has(redirectTab)
        ? redirectTab
        : defaultTab;
    const params = new URLSearchParams({
      tab,
      notifyGroup: groupKey,
      notifyItem: item.id,
    });
    navigate(`/?${params.toString()}`);
  };

  const loadFormConfigs = useCallback(async () => {
    if (formsLoaded) return;
    try {
      const res = await fetch('/api/transaction_forms', {
        credentials: 'include',
        skipLoader: true,
      });
      const data = res.ok ? await res.json() : {};
      const entries = Object.entries(data || {}).filter(
        ([name, info]) => name !== 'isDefault' && info && typeof info === 'object',
      );
      setFormEntries(entries);
    } catch {
      setFormEntries([]);
    } finally {
      setFormsLoaded(true);
    }
  }, [formsLoaded]);

  useEffect(() => {
    if (open && !formsLoaded) {
      loadFormConfigs();
    }
  }, [formsLoaded, loadFormConfigs, open]);

  const combinedItems = useMemo(() => {
    const items = [];
    sortedNotifications.forEach((item) => {
      const itemMeta = getActionMeta(item?.action);
      items.push({
        key: `transaction-${item.id}`,
        timestamp: getNotificationTimestamp(item),
        isUnread: item?.isRead === false,
        title: item.transactionName || 'Transaction',
        badge: { label: itemMeta.label, accent: itemMeta.accent },
        preview: buildPreviewText(item),
        dateTime: formatDisplayTimestamp(item.updatedAt || item.createdAt),
        onClick: () => handleNotificationClick(item),
      });
    });
    reportItems.forEach(({ req, tab, status, scope }) => {
      const statusMeta = getStatusMeta(status);
      const title = `${formatRequestType(req?.request_type)}`;
      const previewLabel =
        scope === 'response'
          ? `Responded by ${getResponder(req) || 'Unknown'}`
          : `Requested by ${getRequester(req) || 'Unknown'}`;
      const timestamp = getRequestTimestamp(req, scope);
      items.push({
        key: `report-${req?.request_id || title}-${status}-${scope}`,
        timestamp,
        isUnread: status === 'pending',
        title,
        badge: { label: statusMeta.label, accent: statusMeta.accent },
        preview: previewLabel,
        dateTime: formatDisplayTimestamp(timestamp),
        onClick: () => openRequest(req, tab, status),
      });
    });
    changeItems.forEach(({ req, tab, status, scope }) => {
      const statusMeta = getStatusMeta(status);
      const title = `${formatRequestType(req?.request_type)}`;
      const previewLabel =
        scope === 'response'
          ? `Responded by ${getResponder(req) || 'Unknown'}`
          : `Requested by ${getRequester(req) || 'Unknown'}`;
      const timestamp = getRequestTimestamp(req, scope);
      items.push({
        key: `change-${req?.request_id || title}-${status}-${scope}`,
        timestamp,
        isUnread: status === 'pending',
        title,
        badge: { label: statusMeta.label, accent: statusMeta.accent },
        preview: previewLabel,
        dateTime: formatDisplayTimestamp(timestamp),
        onClick: () => openRequest(req, tab, status),
      });
    });
    temporaryItems.forEach(({ entry, scope }) => {
      const formName =
        entry?.formName ||
        entry?.form_name ||
        entry?.configName ||
        entry?.config_name ||
        entry?.moduleKey ||
        entry?.module_key ||
        'Temporary transaction';
      const title = `${formName}`;
      const statusMeta = getTemporaryStatusMeta(
        entry?.status || entry?.review_status || (scope === 'review' ? 'pending' : ''),
      );
      const timestamp = getTemporaryTimestamp(entry);
      items.push({
        key: `temporary-${getTemporaryEntryKey(entry) || title}-${scope}`,
        timestamp,
        isUnread: scope === 'review',
        title,
        badge: { label: statusMeta.label, accent: statusMeta.accent },
        preview: entry?.creatorName || entry?.creator_name || entry?.created_by || '',
        dateTime: formatDisplayTimestamp(timestamp),
        onClick: () => openTemporary(scope, entry),
      });
    });
    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [
    changeItems,
    handleNotificationClick,
    openRequest,
    openTemporary,
    reportItems,
    sortedNotifications,
    temporaryItems,
  ]);

  const visibleItems = useMemo(
    () => combinedItems.slice(0, visibleCount),
    [combinedItems, visibleCount],
  );
  const hasAnyNotifications = combinedItems.length > 0;
  const isInitialLoading =
    open &&
    !initialLoadComplete &&
    (reportState.loading || changeState.loading || temporaryState.loading);
  const hasMoreItems = visibleItems.length < combinedItems.length;

  const handleListScroll = useCallback((event) => {
    const node = event?.currentTarget;
    if (!node || isInitialLoading) return;
    const nearBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 40;
    if (nearBottom) {
      setVisibleCount((prev) => Math.min(prev + DROPDOWN_CHUNK_SIZE, combinedItems.length));
    }
  }, [combinedItems.length, isInitialLoading]);

  useEffect(() => {
    if (!open) return;
    setVisibleCount(DROPDOWN_CHUNK_SIZE);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setVisibleCount((prev) => Math.min(Math.max(prev, DROPDOWN_CHUNK_SIZE), combinedItems.length || DROPDOWN_CHUNK_SIZE));
  }, [combinedItems.length, open]);

  return (
    <div style={styles.wrapper} ref={containerRef}>
      <button
        type="button"
        style={styles.button}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
      </button>
      {open && (
        <div style={styles.dropdown}>
          <div style={styles.list} ref={listRef} onScroll={handleListScroll}>
            {isInitialLoading && <div style={styles.empty}>Loading notifications…</div>}
            {!isInitialLoading && !hasAnyNotifications && (
              <div style={styles.empty}>No notifications yet</div>
            )}
            {visibleItems.map((item) => (
              <button
                key={item.key}
                type="button"
                style={styles.notificationItem(item.isUnread)}
                onClick={item.onClick}
              >
                <div style={styles.notificationTitle}>
                  <span>{item.title}</span>
                  <span style={styles.actionBadge(item.badge?.accent)}>
                    {item.badge?.label}
                  </span>
                </div>
                <div style={styles.notificationPreview}>{item.preview}</div>
                {item.dateTime && (
                  <div style={styles.notificationMeta}>{item.dateTime}</div>
                )}
              </button>
            ))}
            {hasMoreItems && !isInitialLoading && (
              <div style={styles.moreHint}>Scroll to load more…</div>
            )}
          </div>
          <button
            type="button"
            style={styles.footer}
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            Open dashboard
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: 'relative',
    marginRight: '0.5rem',
  },
  button: {
    position: 'relative',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1.05rem',
    padding: '0.35rem 0.5rem',
    borderRadius: '999px',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-2px',
    background: '#e11d48',
    color: '#fff',
    borderRadius: '999px',
    fontSize: '0.7rem',
    padding: '0 0.4rem',
    lineHeight: '1.3rem',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    marginTop: '0.4rem',
    width: '320px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 12px 30px rgba(15,23,42,0.2)',
    overflow: 'hidden',
    zIndex: 60,
  },
  list: {
    maxHeight: '360px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '0.75rem 1rem 1rem',
  },
  empty: {
    padding: '1rem',
    color: '#64748b',
    textAlign: 'center',
  },
  moreHint: {
    padding: '0.35rem 0.25rem 0',
    color: '#64748b',
    textAlign: 'center',
    fontSize: '0.75rem',
  },
  notificationItem: (isUnread) => ({
    width: '100%',
    textAlign: 'left',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    background: isUnread ? '#eff6ff' : '#fff',
    padding: '0.6rem 0.75rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  }),
  notificationTitle: {
    fontWeight: 600,
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  actionBadge: (accent) => ({
    background: accent || '#2563eb',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.45rem',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }),
  notificationPreview: {
    fontSize: '0.8rem',
    color: '#334155',
  },
  notificationMeta: {
    fontSize: '0.72rem',
    color: '#64748b',
  },
  footer: {
    width: '100%',
    border: 'none',
    background: '#f1f5f9',
    padding: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

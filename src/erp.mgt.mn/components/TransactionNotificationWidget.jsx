import { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useTransactionNotifications } from '../context/TransactionNotificationContext.jsx';
import { hasTransactionFormAccess } from '../utils/transactionFormAccess.js';
import {
  isModuleLicensed,
  isModulePermissionGranted,
} from '../utils/moduleAccess.js';
import { resolveWorkplacePositionForContext } from '../utils/workplaceResolver.js';

const ARROW_SEPARATOR = '→';
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
const PLAN_FLAG_KEYS = ['is_plan', 'isPlan', 'isPlanTransaction', 'is_plan_transaction'];
const PLAN_COMPLETION_KEYS = [
  'is_plan_completion',
  'isPlanCompletion',
  'isPlanCompletionTransaction',
];
const DEFAULT_PLAN_NOTIFICATION_FIELDS = ['is_plan', 'is_plan_completion'];
const DEFAULT_PLAN_NOTIFICATION_VALUES = ['1'];
const DEFAULT_DUTY_NOTIFICATION_FIELDS = [];
const DEFAULT_DUTY_NOTIFICATION_VALUES = ['1'];

function resolveModuleKey(info) {
  return info?.moduleKey || info?.module_key || info?.module || info?.modulekey || '';
}

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

function hasFlag(row, keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) {
      return normalizeFlagValue(row[key]);
    }
  }
  return false;
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

function getSummaryFieldValue(item, fieldName) {
  const normalizedTarget = normalizeFieldName(fieldName);
  if (!normalizedTarget) return null;
  const fields = Array.isArray(item?.summaryFields) ? item.summaryFields : [];
  const match = fields.find(
    (field) => normalizeFieldName(field?.field) === normalizedTarget,
  );
  if (!match) return null;
  if (Object.prototype.hasOwnProperty.call(match, 'value')) {
    return match.value;
  }
  if (Object.prototype.hasOwnProperty.call(match, 'val')) {
    return match.val;
  }
  if (Object.prototype.hasOwnProperty.call(match, 'fieldValue')) {
    return match.fieldValue;
  }
  return null;
}

function getCompletionReference(planRow) {
  if (!planRow || typeof planRow !== 'object') return null;
  const keys = Object.keys(planRow);
  for (const key of keys) {
    const normalized = key.toLowerCase();
    if (!normalized.includes('completion')) continue;
    if (normalized.includes('is_plan_completion') || normalized.includes('isplancompletion'))
      continue;
    const value = planRow[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') continue;
    return value;
  }
  return null;
}

function formatTimestamp(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
}

function formatActionLabel(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (normalized === 'excluded' || normalized === 'exclude') {
    return 'Excluded';
  }
  if (normalized === 'included' || normalized === 'include') {
    return 'Included';
  }
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return 'Edited';
  }
  if (normalized === 'changed' || normalized === 'change') {
    return 'Changed';
  }
  if (normalized === 'deleted' || normalized === 'delete') {
    return 'Deleted';
  }
  return 'New';
}

function getActionMeta(action) {
  const label = formatActionLabel(action);
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (normalized === 'excluded' || normalized === 'exclude') {
    return { label, accent: '#ea580c', background: '#ffedd5', text: '#9a3412' };
  }
  if (normalized === 'included' || normalized === 'include') {
    return { label, accent: '#059669', background: '#d1fae5', text: '#065f46' };
  }
  if (normalized === 'deleted' || normalized === 'delete') {
    return { label, accent: '#dc2626', background: '#fee2e2', text: '#7f1d1d' };
  }
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return { label, accent: '#2563eb', background: '#dbeafe', text: '#1e3a8a' };
  }
  if (normalized === 'changed' || normalized === 'change') {
    return { label, accent: '#d97706', background: '#fef3c7', text: '#92400e' };
  }
  return { label, accent: '#059669', background: '#d1fae5', text: '#065f46' };
}

function isDeletedAction(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  return normalized === 'deleted' || normalized === 'delete';
}

function isExcludedAction(item) {
  const normalized = typeof item?.action === 'string' ? item.action.trim().toLowerCase() : '';
  return Boolean(item?.excluded) || normalized === 'excluded' || normalized === 'exclude';
}

function buildSummaryText(item) {
  if (!item) return 'Transaction update';
  const actionMeta = getActionMeta(item.action);
  const normalized = typeof item.action === 'string' ? item.action.trim().toLowerCase() : '';
  if (item.summaryText) return item.summaryText;
  if (Array.isArray(item.summaryFields) && item.summaryFields.length > 0) {
    const fields = item.summaryFields
      .map((field) => field?.field)
      .filter(Boolean)
      .join(', ');
    if (fields) {
      if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
        return `Edited fields: ${fields}`;
      }
      if (normalized === 'changed' || normalized === 'change') {
        return `Changed fields: ${fields}`;
      }
    }
  }
  if (normalized === 'deleted' || normalized === 'delete') {
    return 'Transaction deleted';
  }
  if (normalized === 'excluded' || normalized === 'exclude') {
    return 'Transaction excluded';
  }
  if (normalized === 'included' || normalized === 'include') {
    return 'Transaction included';
  }
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return 'Transaction edited';
  }
  return `${actionMeta.label} transaction`;
}

function getActorLabel(item) {
  if (!item) return 'Unknown user';
  const actor = item.actor || item.createdBy || item.updatedBy;
  if (!actor) return 'Unknown user';
  return actor;
}

function normalizeRelationValue(raw) {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function parseRelationValueParts(raw) {
  const normalized = normalizeRelationValue(raw);
  if (!normalized) return { parts: [], separator: '' };
  if (normalized.includes(ARROW_SEPARATOR)) {
    return {
      parts: normalized.split(ARROW_SEPARATOR).map((part) => part.trim()),
      separator: ` ${ARROW_SEPARATOR} `,
    };
  }
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        return {
          parts: parsed.map((value) => normalizeRelationValue(value)),
          separator: ', ',
        };
      }
    } catch {
      // ignore invalid JSON
    }
  }
  return { parts: [normalized], separator: '' };
}

function buildRelationDisplay(row, config, fallbackValue) {
  if (!row || typeof row !== 'object') return fallbackValue ?? '';
  const cfg = config || {};
  const parts = [];
  const idField = cfg.idField || cfg.column;
  const idValue = idField && idField in row ? row[idField] : fallbackValue;
  if (idValue !== undefined && idValue !== null && idValue !== '') {
    parts.push(idValue);
  }
  (cfg.displayFields || []).forEach((field) => {
    if (typeof field !== 'string') return;
    const value = row[field];
    if (value !== undefined && value !== null && value !== '') {
      parts.push(value);
    }
  });
  const formatted = parts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => (typeof part === 'string' ? part : String(part)));
  return formatted.length > 0 ? formatted.join(' - ') : fallbackValue ?? '';
}

function isNonEmptyDisplayValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => isNonEmptyDisplayValue(entry));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && trimmed !== '—';
  }
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function normalizeNotifyGroupKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function TransactionNotificationWidget({ filterMode = 'activity' }) {
  const { groups: allGroups, markGroupRead } = useTransactionNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const generalConfig = useGeneralConfig();
  const {
    company,
    branch,
    department,
    permissions: perms,
    session,
    user,
    workplace,
    workplacePositionMap,
  } = useContext(AuthContext);
  const licensed = useCompanyModules(company);
  const [expanded, setExpanded] = useState(() => new Set());
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());
  const [relationLabelMap, setRelationLabelMap] = useState({});
  const [relationMapVersion, setRelationMapVersion] = useState(0);
  const [codeTransactions, setCodeTransactions] = useState([]);
  const [allowedForms, setAllowedForms] = useState(null);
  const [completionLoading, setCompletionLoading] = useState(() => new Set());
  const groupRefs = useRef({});
  const itemRefs = useRef({});
  const initializedGroups = useRef(new Set());
  const relationMapCache = useRef(new Map());
  const relationConfigCache = useRef(new Map());
  const labelRequestCache = useRef(new Set());
  const allowedFormsCache = useRef(null);
  const allowedFormsPromise = useRef(null);

  const highlightKey = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return normalizeNotifyGroupKey(params.get('notifyGroup'));
  }, [location.search]);
  const highlightItemId = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get('notifyItem');
  }, [location.search]);

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

  const groups = useMemo(() => {
    if (filterMode !== 'plan' && filterMode !== 'activity' && filterMode !== 'duty') {
      return allGroups;
    }
    const isPlanMode = filterMode === 'plan';
    const isDutyMode = filterMode === 'duty';
    return allGroups.reduce((acc, group) => {
      const items = group.items.filter((item) =>
        isPlanMode
          ? isPlanNotificationItem(item)
          : isDutyMode
            ? isDutyNotificationItem(item)
            : !isPlanNotificationItem(item) && !isDutyNotificationItem(item),
      );
      if (items.length === 0) return acc;
      const unreadCount = items.filter((item) => !item.isRead).length;
      acc.push({ ...group, items, unreadCount });
      return acc;
    }, []);
  }, [allGroups, filterMode, isDutyNotificationItem, isPlanNotificationItem]);

  useEffect(() => {
    if (!highlightKey) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(highlightKey);
      return next;
    });
    const target = groupRefs.current[highlightKey];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightKey]);
  useEffect(() => {
    if (!highlightItemId) return;
    const target = itemRefs.current[highlightItemId];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (target && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
  }, [collapsedSections, expanded, highlightItemId]);
  useEffect(() => {
    if (groups.length === 0) return;
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      groups.forEach((group) => {
        if (initializedGroups.current.has(group.key)) return;
        ['active', 'excluded', 'deleted'].forEach((sectionKey) => {
          next.add(buildSectionId(group.key, sectionKey));
        });
        initializedGroups.current.add(group.key);
      });
      return next;
    });
  }, [groups]);
  useEffect(() => {
    if (!highlightItemId) return;
    const groupMatch = highlightKey
      ? groups.find((group) => group.key === highlightKey)
      : groups.find((group) =>
          group.items.some((item) => String(item.id) === highlightItemId),
        );
    if (!groupMatch) return;
    const targetItem = groupMatch.items.find((item) => String(item.id) === highlightItemId);
    if (!targetItem) return;
    const sectionKey = getItemSection(targetItem);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(groupMatch.key);
      return next;
    });
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.delete(buildSectionId(groupMatch.key, sectionKey));
      return next;
    });
  }, [groups, highlightItemId, highlightKey]);

  useEffect(() => {
    allowedFormsCache.current = null;
    allowedFormsPromise.current = null;
  }, [
    branch,
    company,
    department,
    licensed,
    perms,
    session,
    user,
    workplace,
    workplacePositionMap,
  ]);

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

  useEffect(() => {
    let cancelled = false;
    const tables = Array.from(
      new Set(
        groups
          .flatMap((group) => group.items.map((item) => item.transactionTable))
          .filter(Boolean),
      ),
    );
    if (tables.length === 0) return undefined;
    tables.forEach(async (table) => {
      if (!table) return;
      const cacheKey = table.toLowerCase();
      if (relationMapCache.current.has(cacheKey)) return;
      try {
        const res = await fetch(`/api/tables/${encodeURIComponent(table)}/relations`, {
          credentials: 'include',
          skipErrorToast: true,
          skipLoader: true,
        });
        if (!res.ok) {
          relationMapCache.current.set(cacheKey, {});
          setRelationMapVersion((prev) => prev + 1);
          return;
        }
        const list = await res.json().catch(() => []);
        const map = {};
        if (Array.isArray(list)) {
          list.forEach((entry) => {
            const col = entry?.COLUMN_NAME;
            const refTable = entry?.REFERENCED_TABLE_NAME;
            const refColumn = entry?.REFERENCED_COLUMN_NAME;
            if (!col || !refTable || !refColumn) return;
            map[col.toLowerCase()] = {
              table: refTable,
              column: refColumn,
              filterColumn: entry?.filterColumn,
              filterValue: entry?.filterValue,
            };
          });
        }
        if (!cancelled) {
          relationMapCache.current.set(cacheKey, map);
          setRelationMapVersion((prev) => prev + 1);
        }
      } catch {
        relationMapCache.current.set(cacheKey, {});
        setRelationMapVersion((prev) => prev + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [groups]);

  useEffect(() => {
    let cancelled = false;
    const pending = [];
    const setLabel = (cacheKey, label) => {
      setRelationLabelMap((prev) => {
        if (prev[cacheKey] === label) return prev;
        return { ...prev, [cacheKey]: label };
      });
    };

    const ensureLabel = async ({
      table,
      relation,
      rawValue,
      valueKey,
      displayConfig,
    }) => {
      const cacheKey = `${table}|${valueKey}`;
      if (relationLabelMap[cacheKey]) return;
      if (labelRequestCache.current.has(cacheKey)) return;
      labelRequestCache.current.add(cacheKey);
      try {
        const params = new URLSearchParams({ page: 1, perPage: 1 });
        params.set(displayConfig.idField || relation.column, valueKey);
        if (relation.filterColumn && relation.filterValue !== undefined) {
          params.set(relation.filterColumn, relation.filterValue);
        }
        const res = await fetch(
          `/api/tables/${encodeURIComponent(relation.table)}?${params.toString()}`,
          { credentials: 'include' },
        );
        let row = null;
        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          row = Array.isArray(json.rows) ? json.rows[0] : null;
        }
        if (cancelled) return;
        if (row && typeof row === 'object') {
          const label = buildRelationDisplay(row, displayConfig, rawValue);
          if (label) setLabel(cacheKey, label);
        }
      } catch {
        // ignore
      }
    };

    const fetchDisplayConfig = async (relation) => {
      const cacheKey = `${relation.table}|${relation.column}|${relation.filterColumn || ''}|${
        relation.filterValue ?? ''
      }`;
      if (relationConfigCache.current.has(cacheKey)) {
        return relationConfigCache.current.get(cacheKey);
      }
      try {
        const params = new URLSearchParams({ table: relation.table });
        if (relation.column) params.set('targetColumn', relation.column);
        if (relation.filterColumn) params.set('filterColumn', relation.filterColumn);
        if (
          relation.filterColumn &&
          relation.filterValue !== undefined &&
          relation.filterValue !== null
        ) {
          params.set('filterValue', String(relation.filterValue));
        }
        const res = await fetch(`/api/display_fields?${params.toString()}`, {
          credentials: 'include',
        });
        const cfg = res.ok ? await res.json().catch(() => ({})) : {};
        const normalized = {
          idField:
            typeof cfg?.idField === 'string' && cfg.idField.trim()
              ? cfg.idField
              : relation.column,
          displayFields: Array.isArray(cfg?.displayFields) ? cfg.displayFields : [],
        };
        relationConfigCache.current.set(cacheKey, normalized);
        return normalized;
      } catch {
        const fallback = { idField: relation.column, displayFields: [] };
        relationConfigCache.current.set(cacheKey, fallback);
        return fallback;
      }
    };

    const loadMissing = async () => {
      for (const group of groups) {
        for (const item of group.items) {
          if (!item.transactionTable || !Array.isArray(item.summaryFields)) continue;
          const relMap =
            relationMapCache.current.get(item.transactionTable.toLowerCase()) || {};
          for (const field of item.summaryFields) {
            const relation = relMap[field?.field?.toLowerCase?.() || ''];
            if (!relation?.table || !relation?.column) continue;
            const { parts } = parseRelationValueParts(field?.value);
            if (parts.length === 0) continue;
            // eslint-disable-next-line no-await-in-loop
            const displayConfig = await fetchDisplayConfig(relation);
            parts.forEach((part) => {
              const valueKey = normalizeRelationValue(part);
              if (!valueKey || valueKey === '—') return;
              pending.push(
                ensureLabel({
                  table: relation.table,
                  relation,
                  rawValue: part,
                  valueKey,
                  displayConfig,
                }),
              );
            });
          }
        }
      }
    };

    loadMissing();

    return () => {
      cancelled = true;
    };
  }, [groups, relationLabelMap, relationMapVersion]);

  const resolveTransactionFormInfo = useCallback(
    (item) => {
      if (!item || !allowedForms) return null;
      const normalizedName = normalizeText(item.transactionName);
      if (normalizedName) {
        const entry = Object.entries(allowedForms).find(
          ([name]) => normalizeText(name) === normalizedName,
        );
        if (entry) return entry[1];
      }
      const normalizedTable = normalizeText(item.transactionTable);
      if (normalizedTable) {
        const entry = Object.entries(allowedForms).find(([, info]) => {
          const table = normalizeText(info?.table ?? info?.tableName ?? info?.table_name);
          return table && table === normalizedTable;
        });
        if (entry) return entry[1];
      }
      return null;
    },
    [allowedForms],
  );

  const resolveSummaryValue = useCallback(
    (item, field) => {
      if (!item?.transactionTable || !field?.field) return field?.value ?? '';
      const relMap =
        relationMapCache.current.get(item.transactionTable.toLowerCase()) || {};
      const relation = relMap[field.field.toLowerCase()];
      if (!relation?.table || !relation?.column) return field?.value ?? '';
      const { parts, separator } = parseRelationValueParts(field.value);
      if (parts.length === 0) return field?.value ?? '';
      const resolvedParts = parts.map((part) => {
        const valueKey = normalizeRelationValue(part);
        const lookupKey = `${relation.table}|${valueKey}`;
        return relationLabelMap[lookupKey] || part;
      });
      if (!separator) return resolvedParts[0] ?? field?.value ?? '';
      return resolvedParts.join(separator);
    },
    [relationLabelMap],
  );

  const buildSummaryTableFields = useCallback(
    (item) => {
      const summaryFields = Array.isArray(item?.summaryFields) ? item.summaryFields : [];
      if (summaryFields.length === 0) return [];
      const formInfo = resolveTransactionFormInfo(item);
      const dashboardFieldsRaw =
        formInfo?.notificationDashboardFields ?? formInfo?.notification_dashboard_fields ?? [];
      const dashboardFields = Array.isArray(dashboardFieldsRaw)
        ? dashboardFieldsRaw.map((field) => String(field).trim()).filter(Boolean)
        : [];
      let orderedFields = summaryFields;
      if (dashboardFields.length > 0) {
        const summaryMap = new Map(
          summaryFields.map((field) => [normalizeFieldName(field?.field), field]),
        );
        orderedFields = dashboardFields
          .map((fieldName) => summaryMap.get(normalizeFieldName(fieldName)))
          .filter(Boolean);
      }
      return orderedFields
        .map((field) => {
          const label = field?.field ?? field?.label ?? field?.name ?? '';
          const value = resolveSummaryValue(item, field);
          return { label, value };
        })
        .filter((entry) => entry.label && isNonEmptyDisplayValue(entry.value));
    },
    [resolveSummaryValue, resolveTransactionFormInfo],
  );

  const groupItems = useCallback((items = []) => {
    const excludedItems = items.filter((item) => isExcludedAction(item));
    const deletedItems = items.filter((item) => isDeletedAction(item?.action));
    const activeItems = items.filter(
      (item) => !isDeletedAction(item?.action) && !isExcludedAction(item),
    );
    return { activeItems, deletedItems, excludedItems };
  }, []);

  const completionTransactions = useMemo(
    () => codeTransactions.filter((row) => hasFlag(row, PLAN_COMPLETION_KEYS)),
    [codeTransactions],
  );

  const findCompletionRow = useCallback(
    (planRow) => {
      if (!planRow) return null;
      const completionReference = getCompletionReference(planRow);
      if (completionReference !== null && completionReference !== undefined) {
        const referenceKey = normalizeText(completionReference);
        const match = completionTransactions.find((row) => {
          const name = normalizeText(getRowValue(row, TRANSACTION_NAME_KEYS));
          const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
          const typeId = normalizeText(row.UITransType ?? row.transType ?? row.id);
          return (
            (name && name === referenceKey) ||
            (table && table === referenceKey) ||
            (typeId && typeId === referenceKey)
          );
        });
        if (match) return match;
      }

      if (completionTransactions.length === 1) return completionTransactions[0];

      const planTable = normalizeText(getRowValue(planRow, TRANSACTION_TABLE_KEYS));
      if (planTable) {
        const tableMatch = completionTransactions.find((row) => {
          const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
          return table && table === planTable;
        });
        if (tableMatch) return tableMatch;
      }

      return null;
    },
    [completionTransactions],
  );

  const loadAllowedForms = useCallback(async () => {
    if (allowedFormsCache.current) return allowedFormsCache.current;
    if (allowedFormsPromise.current) return allowedFormsPromise.current;

    const params = new URLSearchParams();
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
    const workplaceId = workplace ?? session?.workplace_id ?? session?.workplaceId ?? null;
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
    const request = fetch(
      `/api/transaction_forms${query ? `?${query}` : ''}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const filtered = {};
        const branchId = branch != null ? String(branch) : null;
        const departmentId = department != null ? String(department) : null;
        Object.entries(data).forEach(([name, info]) => {
          if (name === 'isDefault') return;
          if (!info || typeof info !== 'object') return;
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
          const moduleKey = resolveModuleKey(info) || 'forms';
          if (!isModulePermissionGranted(perms, moduleKey)) return;
          if (!isModuleLicensed(licensed, moduleKey)) return;
          filtered[name] = info;
        });
        allowedFormsCache.current = filtered;
        return filtered;
      })
      .catch(() => ({}))
      .finally(() => {
        allowedFormsPromise.current = null;
      });

    allowedFormsPromise.current = request;
    return request;
  }, [
    branch,
    department,
    licensed,
    perms,
    session,
    user,
    workplace,
    workplacePositionMap,
  ]);

  useEffect(() => {
    let cancelled = false;
    loadAllowedForms()
      .then((forms) => {
        if (!cancelled) setAllowedForms(forms);
      })
      .catch(() => {
        if (!cancelled) setAllowedForms({});
      });
    return () => {
      cancelled = true;
    };
  }, [loadAllowedForms]);

  const resolveCompletionForm = useCallback((completionRow, forms) => {
    if (!completionRow || !forms) return null;
    const completionName = normalizeText(getRowValue(completionRow, TRANSACTION_NAME_KEYS));
    if (completionName) {
      const entry = Object.entries(forms).find(
        ([name]) => normalizeText(name) === completionName,
      );
      if (entry) return { name: entry[0], info: entry[1] };
    }
    const completionTable = normalizeText(getRowValue(completionRow, TRANSACTION_TABLE_KEYS));
    if (completionTable) {
      const entry = Object.entries(forms).find(([, info]) => {
        const table = normalizeText(info?.table ?? info?.tableName ?? info?.table_name);
        return table && table === completionTable;
      });
      if (entry) return { name: entry[0], info: entry[1] };
    }
    return null;
  }, []);

  const handleAddCompletion = useCallback(
    async (item) => {
      const itemKey = String(item?.id ?? item?.transactionId ?? '');
      setCompletionLoading((prev) => {
        const next = new Set(prev);
        next.add(itemKey);
        return next;
      });

      try {
        const planRow = findTransactionRow(item);
        if (!planRow || !hasFlag(planRow, PLAN_FLAG_KEYS)) {
          addToast('Completion is not available for this transaction.', 'error');
          return;
        }
        const forms = await loadAllowedForms();
        const completionRow = findCompletionRow(planRow);
        const candidateRows = completionRow
          ? [completionRow, ...completionTransactions.filter((row) => row !== completionRow)]
          : completionTransactions;
        const completionForm = candidateRows.reduce((result, row) => {
          if (result) return result;
          return resolveCompletionForm(row, forms);
        }, null);
        if (!completionForm) {
          addToast('Completion form is not available for your access.', 'error');
          return;
        }

        const moduleKey = resolveModuleKey(completionForm.info) || 'forms';
        const slug = moduleKey.replace(/_/g, '-');
        let path = '/forms';
        if (moduleKey && moduleKey !== 'forms') {
          path = `/forms/${slug}`;
        }
        const params = new URLSearchParams();
        params.set(`name_${moduleKey}`, completionForm.name);
        if (item?.transactionId !== undefined && item?.transactionId !== null) {
          params.set('planTransactionId', String(item.transactionId));
        }
        if (item?.referenceId !== undefined && item?.referenceId !== null) {
          params.set('planReferenceId', String(item.referenceId));
        }
        if (item?.referenceTable) {
          params.set('planReferenceTable', String(item.referenceTable));
        }
        const planIdFieldName = generalConfig?.plan?.planIdFieldName?.trim();
        if (planIdFieldName) {
          const planIdValue = getSummaryFieldValue(item, planIdFieldName);
          params.set('planFieldName', planIdFieldName);
          if (
            planIdValue !== null &&
            planIdValue !== undefined &&
            planIdValue !== ''
          ) {
            params.set('planFieldValue', String(planIdValue));
          }
        }
        params.set('planOpen', '1');
        navigate(`${path}?${params.toString()}`);
      } finally {
        setCompletionLoading((prev) => {
          const next = new Set(prev);
          next.delete(itemKey);
          return next;
        });
      }
    },
    [
      addToast,
      findCompletionRow,
      findTransactionRow,
      loadAllowedForms,
      navigate,
      generalConfig,
      resolveCompletionForm,
    ],
  );

  const toggleExpanded = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const buildSectionId = (groupKey, sectionKey) => `${groupKey}-${sectionKey}`;

  const isSectionExpanded = (groupKey, sectionKey) =>
    !collapsedSections.has(buildSectionId(groupKey, sectionKey));

  const toggleSection = (groupKey, sectionKey) => {
    const sectionId = buildSectionId(groupKey, sectionKey);
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const getItemSection = (item) => {
    if (isDeletedAction(item?.action)) return 'deleted';
    if (isExcludedAction(item)) return 'excluded';
    return 'active';
  };

  const renderGroup = (group) => {
    const isExpanded = expanded.has(group.key);
    const isHighlighted = group.key === highlightKey;
    return (
      <div
        key={group.key}
        style={styles.group(isHighlighted)}
        ref={(node) => {
          groupRefs.current[group.key] = node;
        }}
      >
        <div style={styles.groupHeader}>
          <button
            type="button"
            style={styles.groupToggle}
            onClick={() => toggleExpanded(group.key)}
          >
            <span style={styles.groupName}>{group.name}</span>
            <span style={styles.groupCount}>
              {group.unreadCount > 0
                ? `${group.unreadCount} unread`
                : `${group.items.length} total`}
            </span>
          </button>
          {group.unreadCount > 0 && (
            <button
              type="button"
              style={styles.markRead}
              onClick={() => markGroupRead(group.key)}
            >
              Mark read
            </button>
          )}
        </div>
        {isExpanded && (
          <div style={styles.items}>
            {(() => {
              const { activeItems, deletedItems, excludedItems } = groupItems(group.items);
              const renderItems = (items) =>
                items.map((item) => {
                  const actionMeta = getActionMeta(item.action);
                  const actorLabel = getActorLabel(item);
                  const isHighlighted = highlightItemId === String(item.id);
                  const planRow = findTransactionRow(item);
                  const canAddCompletion = planRow && hasFlag(planRow, PLAN_FLAG_KEYS);
                  const isCompletionLoading = completionLoading.has(String(item.id));
                  const summaryTableFields = buildSummaryTableFields(item);
                  return (
                    <div
                      key={item.id}
                      tabIndex={-1}
                      ref={(node) => {
                        itemRefs.current[String(item.id)] = node;
                      }}
                      style={styles.item(item.isRead, actionMeta.accent, isHighlighted)}
                    >
                      <div style={styles.itemSummary}>
                        <span style={styles.itemAction(actionMeta)}>
                          {actionMeta.label}
                        </span>
                        <span>{buildSummaryText(item)}</span>
                        {canAddCompletion && (
                          <button
                            type="button"
                            style={styles.completionButton(isCompletionLoading)}
                            onClick={() => handleAddCompletion(item)}
                            disabled={isCompletionLoading}
                          >
                            {isCompletionLoading ? 'Opening…' : 'Add completion'}
                          </button>
                        )}
                      </div>
                      {summaryTableFields.length > 0 && (
                        <div style={styles.summaryTableWrapper}>
                          <table style={styles.summaryTable}>
                            <thead>
                              <tr>
                                {summaryTableFields.map((field) => (
                                  <th
                                    key={`${item.id}-${field.label}-header`}
                                    style={styles.summaryTableHeader}
                                  >
                                    {field.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {summaryTableFields.map((field) => (
                                  <td
                                    key={`${item.id}-${field.label}-value`}
                                    style={styles.summaryTableCell}
                                  >
                                    {field.value}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div style={styles.itemMeta}>
                        <span>By {actorLabel}</span>
                        <span style={styles.itemMetaSeparator}>•</span>
                        <span>{formatTimestamp(item.updatedAt || item.createdAt)}</span>
                      </div>
                    </div>
                  );
                });

              const renderSection = (sectionKey, title, items, emptyText) => {
                const isExpanded = isSectionExpanded(group.key, sectionKey);
                return (
                  <div style={styles.itemGroup}>
                    <button
                      type="button"
                      style={styles.itemGroupHeader}
                      onClick={() => toggleSection(group.key, sectionKey)}
                    >
                      <span style={styles.itemGroupTitleRow}>
                        <span style={styles.itemGroupTitle}>{title}</span>
                        <span style={styles.itemGroupChevron}>
                          {isExpanded ? '▾' : '▸'}
                        </span>
                      </span>
                      <span style={styles.itemGroupCount}>{items.length}</span>
                    </button>
                    {isExpanded && items.length === 0 && (
                      <div style={styles.itemGroupEmpty}>{emptyText}</div>
                    )}
                    {isExpanded && renderItems(items)}
                  </div>
                );
              };

              return (
                <>
                  {renderSection(
                    'active',
                    'Active',
                    activeItems,
                    'No active transaction alerts.',
                  )}
                  {renderSection(
                    'excluded',
                    'Excluded',
                    excludedItems,
                    'No excluded transaction alerts.',
                  )}
                  {renderSection(
                    'deleted',
                    'Deleted',
                    deletedItems,
                    'No deleted transaction alerts.',
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          {filterMode === 'plan'
            ? 'Plan Notifications'
            : filterMode === 'duty'
              ? 'Duty Notifications'
              : 'Transaction Notifications'}
        </h3>
        <span style={styles.subtitle}>
          {filterMode === 'plan'
            ? 'Grouped plan transaction alerts'
            : filterMode === 'duty'
              ? 'Grouped duty transaction alerts'
              : 'Grouped by transaction name'}
        </span>
      </div>
      {groups.length === 0 && (
        <div style={styles.empty}>
          {filterMode === 'plan'
            ? 'No plan notifications yet.'
            : filterMode === 'duty'
              ? 'No duty notifications yet.'
              : 'No transaction notifications yet.'}
        </div>
      )}
      {groups.length > 0 && (
        <div style={styles.list}>
          {groups.map((group) => renderGroup(group))}
        </div>
      )}
    </section>
  );
}

const styles = {
  section: {
    background: '#fff',
    borderRadius: '12px',
    padding: '1rem',
    boxShadow: '0 6px 20px rgba(15,23,42,0.08)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  title: { margin: 0, fontSize: '1rem', color: '#0f172a' },
  subtitle: { fontSize: '0.75rem', color: '#64748b' },
  empty: { color: '#64748b', padding: '0.75rem 0' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  group: (highlighted) => ({
    border: highlighted ? '2px solid #2563eb' : '1px solid #e5e7eb',
    borderRadius: '10px',
    background: highlighted ? '#eff6ff' : '#fff',
    padding: '0.75rem',
  }),
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  groupToggle: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    flexGrow: 1,
  },
  groupName: { display: 'block', fontWeight: 600, color: '#0f172a' },
  groupCount: { display: 'block', fontSize: '0.75rem', color: '#64748b' },
  markRead: {
    background: '#e2e8f0',
    border: 'none',
    borderRadius: '999px',
    padding: '0.35rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  items: { marginTop: '0.75rem', display: 'grid', gap: '0.75rem' },
  itemGroup: {
    display: 'grid',
    gap: '0.5rem',
    padding: '0.5rem',
    borderRadius: '10px',
    background: '#f8fafc',
  },
  itemGroupHeader: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    padding: 0,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#64748b',
  },
  itemGroupTitleRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  itemGroupTitle: { fontWeight: 600 },
  itemGroupChevron: {
    fontSize: '0.9rem',
    lineHeight: 1,
    color: '#94a3b8',
  },
  itemGroupCount: {
    background: '#e2e8f0',
    borderRadius: '999px',
    padding: '0.1rem 0.45rem',
    fontSize: '0.65rem',
    color: '#1e293b',
  },
  itemGroupEmpty: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    padding: '0.1rem 0.25rem',
  },
  item: (isRead, accent, highlighted) => ({
    background: highlighted ? '#dbeafe' : isRead ? '#f8fafc' : '#e0f2fe',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
    borderLeft: `4px solid ${accent || '#2563eb'}`,
    border: highlighted ? '1px solid #2563eb' : '1px solid transparent',
    boxShadow: highlighted ? '0 0 0 2px rgba(37,99,235,0.15)' : 'none',
  }),
  itemSummary: {
    fontSize: '0.85rem',
    color: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  completionButton: (isLoading) => ({
    marginLeft: 'auto',
    background: isLoading ? '#94a3b8' : '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '999px',
    padding: '0.2rem 0.6rem',
    fontSize: '0.7rem',
    cursor: isLoading ? 'default' : 'pointer',
  }),
  itemAction: (meta) => ({
    background: meta?.background || '#1d4ed8',
    color: meta?.text || '#fff',
    borderRadius: '999px',
    padding: '0.15rem 0.5rem',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  }),
  summaryFields: {
    marginTop: '0.35rem',
    display: 'grid',
    gap: '0.25rem',
  },
  summaryFieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: '#475569',
  },
  summaryFieldLabel: { fontWeight: 600 },
  summaryFieldValue: { color: '#0f172a' },
  summaryTableWrapper: {
    marginTop: '0.35rem',
    width: '100%',
  },
  summaryTable: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  },
  summaryTableHeader: {
    textAlign: 'left',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    color: '#64748b',
    padding: '0.2rem 0.3rem',
    borderBottom: '1px solid #e2e8f0',
    verticalAlign: 'bottom',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
  },
  summaryTableCell: {
    fontSize: '0.75rem',
    color: '#0f172a',
    padding: '0.25rem 0.3rem',
    verticalAlign: 'top',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
  },
  itemMeta: {
    fontSize: '0.7rem',
    color: '#64748b',
    marginTop: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  itemMetaSeparator: { margin: '0 0.35rem' },
};

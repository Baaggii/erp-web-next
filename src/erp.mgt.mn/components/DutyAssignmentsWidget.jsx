import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { buildOptionsForRows } from '../utils/buildAsyncSelectOptions.js';
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
const TRANSACTION_TYPE_KEYS = [
  'UITransType',
  'uiTransType',
  'ui_trans_type',
  'transactionType',
  'transaction_type',
  'transType',
  'trans_type',
];

const DEFAULT_DUTY_NOTIFICATION_FIELDS = [];
const DEFAULT_DUTY_NOTIFICATION_VALUES = ['1'];

function normalizeMatch(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function resolveModuleKey(info) {
  return info?.moduleKey || info?.module_key || info?.module || info?.modulekey || '';
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

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
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

function normalizeFieldName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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

function isDutyNotificationRow(row, dutyNotificationConfig) {
  if (!row) return false;
  const normalizedValues = dutyNotificationConfig.values.map(normalizeMatch);
  return dutyNotificationConfig.fields.some((field) => {
    const value = getRowFieldValue(row, field);
    if (value === undefined || value === null || value === '') return false;
    if (normalizedValues.length === 0) return normalizeFlagValue(value);
    return normalizedValues.includes(normalizeMatch(value));
  });
}

function normalizePositionId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function normalizeRelationEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const table =
    (typeof entry.REFERENCED_TABLE_NAME === 'string' && entry.REFERENCED_TABLE_NAME.trim()) ||
    (typeof entry.table === 'string' && entry.table.trim()) ||
    (typeof entry.targetTable === 'string' && entry.targetTable.trim()) ||
    '';
  const column =
    (typeof entry.COLUMN_NAME === 'string' && entry.COLUMN_NAME.trim()) ||
    (typeof entry.sourceColumn === 'string' && entry.sourceColumn.trim()) ||
    (typeof entry.source_column === 'string' && entry.source_column.trim()) ||
    (typeof entry.column === 'string' && entry.column.trim()) ||
    (typeof entry.targetColumn === 'string' && entry.targetColumn.trim()) ||
    '';
  const targetColumn =
    (typeof entry.REFERENCED_COLUMN_NAME === 'string' && entry.REFERENCED_COLUMN_NAME.trim()) ||
    (typeof entry.targetColumn === 'string' && entry.targetColumn.trim()) ||
    '';
  if (!table || !column) return null;
  const rel = {
    table,
    column,
    targetColumn,
  };
  const idField = entry.idField ?? entry.id_field;
  if (typeof idField === 'string' && idField.trim()) {
    rel.idField = idField.trim();
  }
  const displayFields = entry.displayFields ?? entry.display_fields;
  if (Array.isArray(displayFields)) {
    rel.displayFields = displayFields.filter((field) => typeof field === 'string' && field.trim());
  }
  const filterColumn = entry.filterColumn ?? entry.filter_column;
  const filterValue = entry.filterValue ?? entry.filter_value;
  if (typeof filterColumn === 'string' && filterColumn.trim()) {
    rel.filterColumn = filterColumn.trim();
  }
  if (filterValue !== undefined && filterValue !== null) {
    rel.filterValue = filterValue;
  }
  return rel;
}

async function fetchDisplayConfig(table, relation, signal) {
  if (!table) return { idField: undefined, displayFields: [] };
  try {
    const params = new URLSearchParams({ table });
    const relFilterColumn = relation?.filterColumn ?? relation?.filter_column;
    const relFilterValue = relation?.filterValue ?? relation?.filter_value;
    const relTargetColumn =
      relation?.targetColumn ??
      relation?.target_column ??
      relation?.idField ??
      relation?.id_field ??
      relation?.column ??
      relation?.REFERENCED_COLUMN_NAME;
    if (relFilterColumn && relFilterValue !== undefined && relFilterValue !== null) {
      params.set('filterColumn', relFilterColumn);
      params.set('filterValue', String(relFilterValue));
    }
    if (relTargetColumn) {
      params.set('targetColumn', relTargetColumn);
    }
    const res = await fetch(`/api/display_fields?${params.toString()}`, {
      credentials: 'include',
      signal,
    });
    if (!res.ok) return { idField: undefined, displayFields: [] };
    const cfg = await res.json().catch(() => ({}));
    const idField =
      (typeof cfg?.idField === 'string' && cfg.idField.trim()) ||
      (typeof cfg?.id_field === 'string' && cfg.id_field.trim()) ||
      undefined;
    const displayFields = Array.isArray(cfg?.displayFields)
      ? cfg.displayFields.filter((field) => typeof field === 'string' && field.trim())
      : [];
    return { idField, displayFields };
  } catch (err) {
    if (signal?.aborted) return { idField: undefined, displayFields: [] };
    return { idField: undefined, displayFields: [] };
  }
}

function resolveDashboardFields(info) {
  return parseListValue(
    info?.notificationDashboardFields ??
      info?.notification_dashboard_fields ??
      info?.notificationDashboardField ??
      info?.notification_dashboard_field ??
      [],
  );
}

function normalizeLabel(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function buildColumnLabelMap(columns) {
  const map = new Map();
  if (!Array.isArray(columns)) return map;
  columns.forEach((column) => {
    if (!column || typeof column !== 'object') return;
    const name =
      column.name ||
      column.columnName ||
      column.column_name ||
      column.COLUMN_NAME ||
      null;
    if (!name) return;
    const label =
      normalizeLabel(column.label) ||
      normalizeLabel(column.column_label) ||
      normalizeLabel(column.COLUMN_COMMENT) ||
      normalizeLabel(column.column_comment) ||
      normalizeLabel(column.description) ||
      null;
    const normalized = normalizeFieldName(name);
    if (!normalized) return;
    map.set(normalized, label || String(name));
  });
  return map;
}

function buildPositionLabelMap({ workplacePositionMap, assignments } = {}) {
  const map = new Map();
  const setLabel = (id, label) => {
    const normalizedId = normalizePositionId(id);
    const normalizedLabel = normalizeLabel(label);
    if (!normalizedId || !normalizedLabel) return;
    if (!map.has(normalizedId) || map.get(normalizedId) === normalizedId) {
      map.set(normalizedId, normalizedLabel);
    }
  };

  if (workplacePositionMap && typeof workplacePositionMap === 'object') {
    Object.values(workplacePositionMap).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      setLabel(
        entry.positionId ?? entry.position_id ?? entry.position,
        entry.positionName ??
          entry.position_name ??
          entry.positionLabel ??
          entry.position_label ??
          entry.name,
      );
    });
  }

  if (Array.isArray(assignments)) {
    assignments.forEach((assignment) => {
      if (!assignment || typeof assignment !== 'object') return;
      setLabel(
        assignment.workplace_position_id ??
          assignment.workplacePositionId ??
          assignment.position_id ??
          assignment.positionId ??
          assignment.position,
        assignment.workplace_position_name ??
          assignment.workplacePositionName ??
          assignment.position_name ??
          assignment.positionName ??
          assignment.position_label ??
          assignment.positionLabel,
      );
    });
  }

  return map;
}

function collectPositionIds({ position, workplacePositionMap }) {
  const ids = new Set();
  const direct = normalizePositionId(position);
  if (direct) ids.add(direct);
  if (workplacePositionMap && typeof workplacePositionMap === 'object') {
    Object.values(workplacePositionMap).forEach((entry) => {
      const normalized = normalizePositionId(entry?.positionId);
      if (normalized) ids.add(normalized);
    });
  }
  return Array.from(ids);
}

function buildRowKey(table, row) {
  const id =
    row?.id ??
    row?.[`${table}_id`] ??
    row?.[`${table}Id`] ??
    row?.[`${table}ID`] ??
    row?.[`${table}ID`] ??
    row?.[`${table}Id`] ??
    null;
  if (id !== null && id !== undefined && id !== '') return `${table}::${id}`;
  return `${table}::${JSON.stringify(row)}`;
}

function normalizeDisplayValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isEmptyDisplayValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export default function DutyAssignmentsWidget() {
  const generalConfig = useGeneralConfig();
  const {
    position,
    workplacePositionMap,
    branch,
    company,
    department,
    permissions,
    session,
    user,
    workplace,
  } = useContext(AuthContext);
  const licensed = useCompanyModules(company);
  const [codeTransactions, setCodeTransactions] = useState([]);
  const [transactionForms, setTransactionForms] = useState({});
  const [allowedForms, setAllowedForms] = useState({});
  const [formsLoaded, setFormsLoaded] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedPositionLabels, setResolvedPositionLabels] = useState(new Map());
  const [relationLabelMap, setRelationLabelMap] = useState(new Map());
  const [relationMapVersion, setRelationMapVersion] = useState(0);
  const { addToast } = useToast();
  const dutyDashboardToastRef = useRef('');
  const relationMapCache = useRef(new Map());
  const relationConfigCache = useRef(new Map());
  const relationLabelRequestCache = useRef(new Set());
  const columnLabelCache = useRef(new Map());
  const [columnLabelVersion, setColumnLabelVersion] = useState(0);

  const dutyNotificationConfig = useMemo(() => {
    const fields = parseListValue(generalConfig?.plan?.dutyNotificationFields);
    const values = parseListValue(generalConfig?.plan?.dutyNotificationValues);
    return {
      fields: fields.length > 0 ? fields : DEFAULT_DUTY_NOTIFICATION_FIELDS,
      values: values.length > 0 ? values : DEFAULT_DUTY_NOTIFICATION_VALUES,
    };
  }, [generalConfig]);

  const dutyTables = useMemo(() => {
    const tableSet = new Set();
    codeTransactions.forEach((row) => {
      if (!isDutyNotificationRow(row, dutyNotificationConfig)) return;
      const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
      if (table) tableSet.add(table);
    });
    return Array.from(tableSet);
  }, [codeTransactions, dutyNotificationConfig]);

  const allowedFormMaps = useMemo(() => {
    const nameMap = new Map();
    const tableMap = new Map();
    Object.entries(allowedForms).forEach(([name, info]) => {
      if (!info || typeof info !== 'object') return;
      const normalizedName = normalizeText(name);
      if (normalizedName) nameMap.set(normalizedName, info);
      const normalizedTable = normalizeText(
        info?.table ?? info?.tableName ?? info?.table_name,
      );
      if (normalizedTable) tableMap.set(normalizedTable, info);
    });
    return { nameMap, tableMap };
  }, [allowedForms]);

  const transactionConfigsByType = useMemo(() => {
    const map = new Map();
    Object.values(transactionForms).forEach((info) => {
      if (!info || typeof info !== 'object') return;
      const rawType =
        info.transactionTypeValue ??
        info.transaction_type_value ??
        info.transactionType ??
        info.transaction_type ??
        null;
      if (rawType === null || rawType === undefined || `${rawType}`.trim() === '') return;
      const normalized = normalizeMatch(rawType);
      const existing = map.get(normalized) || [];
      existing.push(info);
      map.set(normalized, existing);
    });
    return map;
  }, [transactionForms]);

  const dashboardFieldsByTable = useMemo(() => {
    const map = new Map();
    codeTransactions.forEach((row) => {
      if (!isDutyNotificationRow(row, dutyNotificationConfig)) return;
      const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
      if (!table) return;
      const transactionType = getRowValue(row, TRANSACTION_TYPE_KEYS);
      const normalizedType = normalizeMatch(transactionType);
      const configs = normalizedType ? transactionConfigsByType.get(normalizedType) : null;
      const fieldSet = new Set(map.get(table) || []);
      if (Array.isArray(configs) && configs.length > 0) {
        configs.forEach((cfg) => {
          resolveDashboardFields(cfg).forEach((field) => fieldSet.add(field));
        });
      } else {
        const name = normalizeText(getRowValue(row, TRANSACTION_NAME_KEYS));
        const fallbackInfo =
          (name && allowedFormMaps.nameMap.get(name)) ||
          allowedFormMaps.tableMap.get(table) ||
          null;
        if (fallbackInfo) {
          resolveDashboardFields(fallbackInfo).forEach((field) => fieldSet.add(field));
        }
      }
      map.set(table, Array.from(fieldSet));
    });
    return map;
  }, [
    allowedFormMaps,
    codeTransactions,
    dutyNotificationConfig,
    transactionConfigsByType,
  ]);

  const dutyLabelsByTable = useMemo(() => {
    const map = new Map();
    codeTransactions.forEach((row) => {
      if (!isDutyNotificationRow(row, dutyNotificationConfig)) return;
      const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
      if (!table) return;
      const label = normalizeLabel(getRowValue(row, TRANSACTION_NAME_KEYS));
      if (label) {
        map.set(table, label);
        return;
      }
      const name = normalizeText(getRowValue(row, TRANSACTION_NAME_KEYS));
      const info =
        (name && allowedFormMaps.nameMap.get(name)) ||
        allowedFormMaps.tableMap.get(table) ||
        null;
      if (!info) return;
      const fallbackLabel = normalizeLabel(
        info?.label ??
          info?.title ??
          info?.displayName ??
          info?.name ??
          info?.transactionName ??
          info?.transaction_name,
      );
      if (fallbackLabel) map.set(table, fallbackLabel);
    });
    return map;
  }, [allowedFormMaps, codeTransactions, dutyNotificationConfig]);

  const positionIds = useMemo(
    () => collectPositionIds({ position, workplacePositionMap }),
    [position, workplacePositionMap],
  );

  const positionLabelMap = useMemo(
    () =>
      buildPositionLabelMap({
        workplacePositionMap,
        assignments: session?.workplace_assignments,
      }),
    [session?.workplace_assignments, workplacePositionMap],
  );

  const mergedPositionLabelMap = useMemo(() => {
    const map = new Map(positionLabelMap);
    resolvedPositionLabels.forEach((label, id) => {
      if (label) map.set(id, label);
    });
    return map;
  }, [positionLabelMap, resolvedPositionLabels]);

  const positionFieldName =
    generalConfig?.plan?.dutyPositionFieldName?.trim() || 'position_id';
  const dutyDashboardToastEnabled = generalConfig?.plan?.dutyDashboardToastEnabled ?? false;

  const visibleFieldsByTable = useMemo(() => {
    const map = new Map();
    assignments.forEach(({ row, table }) => {
      const normalizedTable =
        normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS)) ||
        normalizeText(table);
      if (!normalizedTable) return;
      const dashboardFields = dashboardFieldsByTable.get(normalizedTable);
      const fieldList = dashboardFields ? dashboardFields : Object.keys(row || {});
      fieldList.forEach((key) => {
        if (key === positionFieldName) return;
        const value = getRowFieldValue(row, key);
        if (isEmptyDisplayValue(value)) return;
        if (!map.has(normalizedTable)) map.set(normalizedTable, new Set());
        map.get(normalizedTable).add(key);
      });
    });
    return map;
  }, [assignments, dashboardFieldsByTable, positionFieldName]);

  useEffect(() => {
    let canceled = false;
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
    fetch('/api/transaction_forms', {
      credentials: 'include',
      skipErrorToast: true,
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (canceled) return;
        const formsData = data && typeof data === 'object' ? data : {};
        setTransactionForms(formsData);
        const filtered = {};
        const branchId = branch != null ? String(branch) : null;
        const departmentId = department != null ? String(department) : null;
        Object.entries(formsData).forEach(([name, info]) => {
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
          if (!isModulePermissionGranted(permissions, moduleKey)) return;
          if (!isModuleLicensed(licensed, moduleKey)) return;
          filtered[name] = info;
        });
        setAllowedForms(filtered);
        setFormsLoaded(true);
      })
      .catch(() => {
        if (!canceled) {
          setAllowedForms({});
          setFormsLoaded(true);
        }
      });
    return () => {
      canceled = true;
    };
  }, [
    branch,
    department,
    licensed,
    permissions,
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
    let canceled = false;
    if (dutyTables.length === 0) return undefined;
    dutyTables.forEach(async (table) => {
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
          relationMapCache.current.set(cacheKey, new Map());
          setRelationMapVersion((prev) => prev + 1);
          return;
        }
        const list = await res.json().catch(() => []);
        const map = new Map();
        if (Array.isArray(list)) {
          list
            .map((entry) => normalizeRelationEntry(entry))
            .filter(Boolean)
            .forEach((rel) => {
              map.set(normalizeFieldName(rel.column), rel);
            });
        }
        if (!canceled) {
          relationMapCache.current.set(cacheKey, map);
          setRelationMapVersion((prev) => prev + 1);
        }
      } catch {
        relationMapCache.current.set(cacheKey, new Map());
        setRelationMapVersion((prev) => prev + 1);
      }
    });
    return () => {
      canceled = true;
    };
  }, [dutyTables]);

  useEffect(() => {
    let canceled = false;
    if (dutyTables.length === 0) return undefined;
    dutyTables.forEach(async (table) => {
      if (!table) return;
      const cacheKey = table.toLowerCase();
      if (columnLabelCache.current.has(cacheKey)) return;
      try {
        const res = await fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
          credentials: 'include',
          skipErrorToast: true,
          skipLoader: true,
        });
        if (!res.ok) {
          columnLabelCache.current.set(cacheKey, new Map());
          if (!canceled) setColumnLabelVersion((prev) => prev + 1);
          return;
        }
        const list = await res.json().catch(() => []);
        if (!canceled) {
          columnLabelCache.current.set(cacheKey, buildColumnLabelMap(list));
          setColumnLabelVersion((prev) => prev + 1);
        }
      } catch {
        columnLabelCache.current.set(cacheKey, new Map());
        if (!canceled) setColumnLabelVersion((prev) => prev + 1);
      }
    });
    return () => {
      canceled = true;
    };
  }, [dutyTables]);

  const resolveColumnLabel = useCallback(
    (column, entries) => {
      if (!column || !entries || entries.length === 0) return column;
      const normalizedField = normalizeFieldName(column);
      for (const entry of entries) {
        const normalizedTable =
          normalizeText(getRowValue(entry.row, TRANSACTION_TABLE_KEYS)) ||
          normalizeText(entry.table);
        if (!normalizedTable) continue;
        const labelMap = columnLabelCache.current.get(normalizedTable);
        const label = labelMap?.get(normalizedField);
        if (label) return label;
      }
      return column;
    },
    [columnLabelVersion],
  );

  useEffect(() => {
    let canceled = false;

    const fetchAllRows = async (table, positionId) => {
      const collected = [];
      const perPage = 500;
      let page = 1;
      let total = 0;
      do {
        const params = new URLSearchParams();
        params.set('perPage', String(perPage));
        params.set('page', String(page));
        params.set(positionFieldName, positionId);
        const res = await fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
          credentials: 'include',
          skipErrorToast: true,
          skipLoader: true,
        });
        if (!res.ok) break;
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        total = Number(data?.count) || rows.length;
        collected.push(...rows);
        page += 1;
        if (rows.length < perPage) break;
      } while (collected.length < total);
      return collected;
    };

    const load = async () => {
      if (!positionIds.length || !dutyTables.length) {
        setAssignments([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const results = await Promise.all(
          dutyTables.map(async (table) => {
            const rowsForTable = await Promise.all(
              positionIds.map((positionId) => fetchAllRows(table, positionId)),
            );
            return rowsForTable.flat().map((row) => ({ table, row }));
          }),
        );
        if (canceled) return;
        const flattened = results.flat();
        const unique = new Map();
        flattened.forEach((entry) => {
          const key = buildRowKey(entry.table, entry.row);
          if (!unique.has(key)) unique.set(key, entry);
        });
        setAssignments(Array.from(unique.values()));
      } catch (err) {
        if (!canceled) {
          setAssignments([]);
          setError(err?.message || 'Failed to load duty assignments.');
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    load();

    return () => {
      canceled = true;
    };
  }, [dutyTables, positionFieldName, positionIds]);

  useEffect(() => {
    if (
      !dutyDashboardToastEnabled ||
      !loading ||
      dutyTables.length === 0 ||
      !formsLoaded
    )
      return;
    const signature = JSON.stringify(
      dutyTables.map((table) => {
        const fields = dashboardFieldsByTable.get(table) || [];
        return { table, fields: [...fields].sort() };
      }),
    );
    if (dutyDashboardToastRef.current === signature) return;
    dutyDashboardToastRef.current = signature;
    dutyTables.forEach((table) => {
      const label = dutyLabelsByTable.get(table) || table;
      const fields = dashboardFieldsByTable.get(table) || [];
      if (fields.length === 0) return;
      const fieldList =
        fields.length > 0 ? fields.join(', ') : 'No dashboard fields configured';
      addToast(`Duty dashboard fields for ${label}: ${fieldList}`, 'info');
    });
  }, [
    addToast,
    dashboardFieldsByTable,
    dutyDashboardToastEnabled,
    dutyLabelsByTable,
    dutyTables,
    formsLoaded,
    loading,
  ]);

  useEffect(() => {
    let canceled = false;
    const loadPositionLabels = async () => {
      const ids = new Set();
      assignments.forEach((entry) => {
        const value = getRowFieldValue(entry.row, positionFieldName);
        const normalized = normalizePositionId(value);
        if (normalized) ids.add(normalized);
      });
      if (!ids.size || !dutyTables.length) {
        setResolvedPositionLabels(new Map());
        return;
      }
      try {
        const relationLists = await Promise.all(
          dutyTables.map(async (table) => {
            const res = await fetch(`/api/tables/${encodeURIComponent(table)}/relations`, {
              credentials: 'include',
              skipErrorToast: true,
              skipLoader: true,
            });
            if (!res.ok) return [];
            const list = await res.json().catch(() => []);
            if (!Array.isArray(list)) return [];
            return list.map((entry) => normalizeRelationEntry(entry)).filter(Boolean);
          }),
        );
        if (canceled) return;
        const normalizedPositionField = normalizeFieldName(positionFieldName);
        const candidates = relationLists.flatMap((relations, index) =>
          relations
            .filter(
              (rel) =>
                rel &&
                normalizeFieldName(rel.column) === normalizedPositionField,
            )
            .map((rel) => ({
              ...rel,
              sourceTable: dutyTables[index],
            })),
        );
        if (!candidates.length) {
          setResolvedPositionLabels(new Map());
          return;
        }
        candidates.sort((a, b) => {
          const score = (rel) =>
            rel.table.toLowerCase().includes('position') ? 2 : 0;
          return score(b) - score(a);
        });
        const relation = candidates[0];
        const displayConfig = await fetchDisplayConfig(relation.table, relation);
        if (canceled) return;
        const labelFields =
          Array.isArray(relation.displayFields) && relation.displayFields.length > 0
            ? relation.displayFields
            : displayConfig.displayFields;
        const idField =
          relation.idField ||
          relation.targetColumn ||
          displayConfig.idField ||
          relation.column;
        const labelMap = new Map();
        await Promise.all(
          Array.from(ids).map(async (posId) => {
            const params = new URLSearchParams();
            params.set('perPage', '1');
            if (idField) params.set(idField, posId);
            if (
              relation.filterColumn &&
              relation.filterValue !== undefined &&
              relation.filterValue !== null
            ) {
              params.set(relation.filterColumn, String(relation.filterValue));
            }
            if (company !== null && company !== undefined) {
              params.set('company_id', String(company));
            }
            const res = await fetch(
              `/api/tables/${encodeURIComponent(relation.table)}?${params.toString()}`,
              {
                credentials: 'include',
                skipErrorToast: true,
                skipLoader: true,
              },
            );
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            const rows = Array.isArray(data?.rows) ? data.rows : [];
            if (!rows.length) return;
            const options = await buildOptionsForRows({
              table: relation.table,
              rows,
              idField,
              searchColumn: idField,
              labelFields,
              companyId: company,
            });
            const match = options.find(
              (opt) =>
                opt?.value !== undefined &&
                opt?.value !== null &&
                String(opt.value).trim() === posId,
            );
            if (match?.label) {
              labelMap.set(posId, match.label);
              return;
            }
            const row = rows[0] || {};
            const fallback = (labelFields || [])
              .map((field) => row[field])
              .map((val) => normalizeLabel(val))
              .find((val) => val);
            if (fallback) labelMap.set(posId, fallback);
          }),
        );
        if (!canceled) setResolvedPositionLabels(labelMap);
      } catch (err) {
        if (!canceled) setResolvedPositionLabels(new Map());
      }
    };
    loadPositionLabels();
    return () => {
      canceled = true;
    };
  }, [assignments, company, dutyTables, positionFieldName]);

  useEffect(() => {
    let canceled = false;
    if (!assignments.length || !dutyTables.length) return undefined;

    const setLabel = (cacheKey, label) => {
      setRelationLabelMap((prev) => {
        if (prev.get(cacheKey) === label) return prev;
        const next = new Map(prev);
        next.set(cacheKey, label);
        return next;
      });
    };

    const getDisplayConfig = async (relation) => {
      const cacheKey = `${relation.table}|${relation.targetColumn || relation.column}|${
        relation.filterColumn || ''
      }|${relation.filterValue ?? ''}`;
      if (relationConfigCache.current.has(cacheKey)) {
        return relationConfigCache.current.get(cacheKey);
      }
      const config = await fetchDisplayConfig(relation.table, relation);
      relationConfigCache.current.set(cacheKey, config);
      return config;
    };

    const ensureLabel = async ({ relation, rawValue, valueKey }) => {
      const cacheKey = `${relation.table}|${relation.targetColumn || relation.column}|${
        relation.filterColumn || ''
      }|${relation.filterValue ?? ''}|${valueKey}`;
      if (relationLabelMap.get(cacheKey)) return;
      if (relationLabelRequestCache.current.has(cacheKey)) return;
      relationLabelRequestCache.current.add(cacheKey);
      try {
        const displayConfig = await getDisplayConfig(relation);
        const params = new URLSearchParams({ page: '1', perPage: '1' });
        const idField =
          displayConfig.idField || relation.targetColumn || relation.column;
        if (idField) params.set(idField, valueKey);
        if (
          relation.filterColumn &&
          relation.filterValue !== undefined &&
          relation.filterValue !== null
        ) {
          params.set(relation.filterColumn, String(relation.filterValue));
        }
        const res = await fetch(
          `/api/tables/${encodeURIComponent(relation.table)}?${params.toString()}`,
          { credentials: 'include', skipErrorToast: true, skipLoader: true },
        );
        let row = null;
        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          row = Array.isArray(json.rows) ? json.rows[0] : null;
        }
        if (canceled) return;
        if (row && typeof row === 'object') {
          const label = buildRelationDisplay(row, displayConfig, rawValue);
          if (label) setLabel(cacheKey, label);
        }
      } catch {
        // ignore
      }
    };

    const loadMissing = async () => {
      for (const entry of assignments) {
        const normalizedTable =
          normalizeText(getRowValue(entry.row, TRANSACTION_TABLE_KEYS)) ||
          normalizeText(entry.table);
        if (!normalizedTable) continue;
        const relMap = relationMapCache.current.get(normalizedTable) || new Map();
        const fields =
          dashboardFieldsByTable.get(normalizedTable) ||
          Object.keys(entry.row || {});
        for (const field of fields) {
          if (field === positionFieldName) continue;
          const relation = relMap.get(normalizeFieldName(field));
          if (!relation?.table || !relation?.column) continue;
          const rawValue = getRowFieldValue(entry.row, field);
          const { parts } = parseRelationValueParts(rawValue);
          if (parts.length === 0) continue;
          for (const part of parts) {
            const valueKey = normalizeRelationValue(part);
            if (!valueKey) continue;
            // eslint-disable-next-line no-await-in-loop
            await ensureLabel({ relation, rawValue, valueKey });
          }
        }
      }
    };

    loadMissing();

    return () => {
      canceled = true;
    };
  }, [
    assignments,
    dashboardFieldsByTable,
    dutyTables,
    positionFieldName,
    relationLabelMap,
    relationMapVersion,
  ]);

  const shouldShowEmpty = !loading && !error && assignments.length === 0;

  const dutyTitle = useMemo(() => {
    const labels = new Set();
    codeTransactions.forEach((row) => {
      if (!isDutyNotificationRow(row, dutyNotificationConfig)) return;
      const label = normalizeLabel(getRowValue(row, TRANSACTION_NAME_KEYS));
      if (label) labels.add(label);
    });
    if (labels.size === 1) return Array.from(labels)[0];
    return 'Duty Assignments';
  }, [codeTransactions, dutyNotificationConfig]);

  const groupedAssignments = useMemo(() => {
    const groups = new Map();
    assignments.forEach((entry) => {
      const positionValue = getRowFieldValue(entry.row, positionFieldName);
      const normalizedPosition = normalizePositionId(positionValue) || 'Unknown';
      if (!groups.has(normalizedPosition)) groups.set(normalizedPosition, []);
      groups.get(normalizedPosition).push(entry);
    });
    return Array.from(groups.entries()).map(([positionId, entries]) => {
      const columnSet = new Set();
      entries.forEach(({ row, table }) => {
        const normalizedTable =
          normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS)) ||
          normalizeText(table);
        const dashboardFields = normalizedTable
          ? dashboardFieldsByTable.get(normalizedTable)
          : null;
        const fieldList =
          dashboardFields ? dashboardFields : Object.keys(row || {});
        fieldList.forEach((key) => {
          if (key === positionFieldName) return;
          const value = getRowFieldValue(row, key);
          if (isEmptyDisplayValue(value)) return;
          columnSet.add(key);
        });
      });
      const positionLabel =
        positionId !== 'Unknown' ? mergedPositionLabelMap.get(positionId) : null;
      return {
        positionId,
        positionLabel: positionLabel || positionId,
        entries,
        columns: Array.from(columnSet),
      };
    });
  }, [assignments, dashboardFieldsByTable, mergedPositionLabelMap, positionFieldName]);

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <h3 style={styles.title}>{dutyTitle}</h3>
        <span style={styles.subtitle}>
          {positionIds.length
            ? `Filtered by ${positionIds.length} position${positionIds.length === 1 ? '' : 's'}`
            : 'No positions detected'}
        </span>
      </div>
      {error && <div style={styles.error}>{error}</div>}
      {loading && <div style={styles.status}>Loading duty assignments…</div>}
      {shouldShowEmpty && (
        <div style={styles.empty}>No duty assignments found for your positions.</div>
      )}
      {assignments.length > 0 && (
        <div style={styles.list}>
          {groupedAssignments.map((group) => (
            <div key={group.positionId} style={styles.groupCard}>
              <div style={styles.cardHeader}>
                <strong>{group.positionLabel}</strong>
                <span style={styles.cardMeta}>{group.entries.length} assignment(s)</span>
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {group.columns.map((column) => (
                        <th key={column} style={styles.tableHeaderCell}>
                          {resolveColumnLabel(column, group.entries)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry) => (
                      <tr key={buildRowKey(entry.table, entry.row)}>
                        {group.columns.map((column) => {
                          const normalizedTable = normalizeText(
                            getRowValue(entry.row, TRANSACTION_TABLE_KEYS),
                          );
                          const rawValue = getRowFieldValue(entry.row, column);
                          let value = rawValue;
                          if (column !== 'table' && normalizedTable) {
                            const relMap =
                              relationMapCache.current.get(normalizedTable) || new Map();
                            const relation = relMap.get(normalizeFieldName(column));
                            if (relation?.table) {
                              const { parts, separator } = parseRelationValueParts(rawValue);
                              if (parts.length > 0) {
                                const resolvedParts = parts.map((part) => {
                                  const valueKey = normalizeRelationValue(part);
                                  const cacheKey = `${relation.table}|${
                                    relation.targetColumn || relation.column
                                  }|${relation.filterColumn || ''}|${
                                    relation.filterValue ?? ''
                                  }|${valueKey}`;
                                  return relationLabelMap.get(cacheKey) || part;
                                });
                                value = resolvedParts.join(separator);
                              }
                            }
                          }
                          return (
                            <td key={`${buildRowKey(entry.table, entry.row)}-${column}`} style={styles.tableCell}>
                              {normalizeDisplayValue(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
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
  status: { color: '#64748b', padding: '0.5rem 0' },
  error: { color: '#b91c1c', padding: '0.5rem 0' },
  empty: { color: '#64748b', padding: '0.5rem 0' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  groupCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '0.75rem',
    background: '#fff',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
    gap: '0.5rem',
  },
  cardMeta: { fontSize: '0.75rem', color: '#64748b' },
  tableWrapper: { overflowX: 'auto' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.8rem',
    color: '#1f2937',
  },
  tableHeaderCell: {
    textAlign: 'left',
    fontWeight: 600,
    padding: '0.5rem 0.5rem',
    borderBottom: '1px solid #e5e7eb',
    background: '#f8fafc',
    whiteSpace: 'nowrap',
  },
  tableCell: {
    padding: '0.45rem 0.5rem',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'top',
    wordBreak: 'break-word',
  },
};

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { hasTransactionFormAccess } from '../utils/transactionFormAccess.js';
import {
  isModuleLicensed,
  isModulePermissionGranted,
} from '../utils/moduleAccess.js';
import { resolveWorkplacePositionForContext } from '../utils/workplaceResolver.js';

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

function resolveDashboardFields(info) {
  return parseListValue(
    info?.notificationDashboardFields ??
      info?.notification_dashboard_fields ??
      info?.notificationDashboardField ??
      info?.notification_dashboard_field ??
      [],
  );
}

function resolveTransactionTypeValue(info) {
  return (
    info?.transactionTypeValue ??
    info?.transaction_type_value ??
    info?.transactionType ??
    info?.transaction_type ??
    null
  );
}

function normalizeDashboardFields(fields) {
  const normalized = new Map();
  fields.forEach((field) => {
    if (typeof field !== 'string') return;
    const trimmed = field.trim();
    if (!trimmed) return;
    const key = normalizeFieldName(trimmed);
    if (!key || normalized.has(key)) return;
    normalized.set(key, trimmed);
  });
  return Array.from(normalized.values());
}

function normalizeLabel(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
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

function buildDisplayLabel(row, { idField, displayFields } = {}) {
  if (!row || typeof row !== 'object') return '';
  const fields =
    Array.isArray(displayFields) && displayFields.length > 0
      ? displayFields
      : Object.keys(row);
  const parts = [];
  fields.forEach((field) => {
    if (!field || field === idField) return;
    const value = row[field];
    if (isEmptyDisplayValue(value)) return;
    parts.push(normalizeDisplayValue(value));
  });
  if (parts.length > 0) return parts.join(' - ');
  if (idField && !isEmptyDisplayValue(row[idField])) {
    return normalizeDisplayValue(row[idField]);
  }
  return '';
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
  const [allowedForms, setAllowedForms] = useState({});
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [relationPositionLabels, setRelationPositionLabels] = useState(new Map());

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

  const allowedFormsByType = useMemo(() => {
    const map = new Map();
    Object.values(allowedForms).forEach((info) => {
      if (!info || typeof info !== 'object') return;
      const value = resolveTransactionTypeValue(info);
      if (value === null || value === undefined || `${value}`.trim() === '') return;
      const normalized = normalizeText(value);
      if (!normalized) return;
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push(info);
    });
    return map;
  }, [allowedForms]);

  const dutyTransactionMeta = useMemo(() => {
    const metaByTable = new Map();
    const typeLabelMap = new Map();

    codeTransactions.forEach((row) => {
      if (!isDutyNotificationRow(row, dutyNotificationConfig)) return;
      const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
      if (!table) return;
      const typeId = normalizeText(row?.UITransType ?? row?.transType ?? row?.id);
      const typeLabel = normalizeLabel(row?.UITransTypeName) ||
        normalizeLabel(getRowValue(row, TRANSACTION_NAME_KEYS));
      if (typeId && typeLabel) typeLabelMap.set(typeId, typeLabel);
      const configs = typeId ? allowedFormsByType.get(typeId) || [] : [];
      const fields = normalizeDashboardFields(
        configs.flatMap((config) => resolveDashboardFields(config)),
      );
      const entry = metaByTable.get(table) || {
        fields: new Map(),
        labels: new Map(),
        typeIds: new Set(),
      };
      fields.forEach((field) => {
        const key = normalizeFieldName(field);
        if (key && !entry.fields.has(key)) entry.fields.set(key, field);
      });
      if (typeLabel) entry.labels.set(typeLabel, typeLabel);
      if (typeId) entry.typeIds.add(typeId);
      metaByTable.set(table, entry);
    });

    metaByTable.forEach((entry, table) => {
      metaByTable.set(table, {
        fields: Array.from(entry.fields.values()),
        labels: Array.from(entry.labels.values()),
        typeIds: Array.from(entry.typeIds.values()),
      });
    });

    return { metaByTable, typeLabelMap };
  }, [allowedFormsByType, codeTransactions, dutyNotificationConfig]);

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

  const positionFieldName =
    generalConfig?.plan?.dutyPositionFieldName?.trim() || 'position_id';

  useEffect(() => {
    let canceled = false;
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
    fetch(`/api/transaction_forms${query ? `?${query}` : ''}`, {
      credentials: 'include',
      skipErrorToast: true,
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (canceled) return;
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
          if (!isModulePermissionGranted(permissions, moduleKey)) return;
          if (!isModuleLicensed(licensed, moduleKey)) return;
          filtered[name] = info;
        });
        setAllowedForms(filtered);
      })
      .catch(() => {
        if (!canceled) setAllowedForms({});
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

  const fetchAllRows = useCallback(async (table, extraParams = {}) => {
    const collected = [];
    const perPage = 500;
    let page = 1;
    let total = 0;
    do {
      const params = new URLSearchParams();
      params.set('perPage', String(perPage));
      params.set('page', String(page));
      Object.entries(extraParams).forEach(([key, value]) => {
        if (value === undefined || value === null || `${value}`.trim() === '') return;
        params.set(key, String(value));
      });
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
        {
          credentials: 'include',
          skipErrorToast: true,
          skipLoader: true,
        },
      );
      if (!res.ok) break;
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      total = Number(data?.count) || rows.length;
      collected.push(...rows);
      page += 1;
      if (rows.length < perPage) break;
    } while (collected.length < total);
    return collected;
  }, []);

  useEffect(() => {
    let canceled = false;

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
              positionIds.map((positionId) =>
                fetchAllRows(table, { [positionFieldName]: positionId }),
              ),
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
  }, [dutyTables, fetchAllRows, positionFieldName, positionIds]);

  useEffect(() => {
    let canceled = false;

    const loadPositionLabels = async () => {
      const positionValues = new Set();
      assignments.forEach((entry) => {
        const value = getRowFieldValue(entry.row, positionFieldName);
        const normalized = normalizePositionId(value);
        if (normalized) positionValues.add(normalized);
      });

      if (positionValues.size === 0) {
        setRelationPositionLabels(new Map());
        return;
      }

      const tables = Array.from(
        new Set(
          assignments
            .map((entry) =>
              normalizeText(
                getRowValue(entry.row, TRANSACTION_TABLE_KEYS) || entry.table,
              ),
            )
            .filter(Boolean),
        ),
      );

      let relationInfo = null;
      for (const table of tables) {
        const res = await fetch(`/api/tables/${encodeURIComponent(table)}/relations`, {
          credentials: 'include',
          skipErrorToast: true,
          skipLoader: true,
        });
        if (!res.ok) continue;
        const list = await res.json().catch(() => []);
        if (!Array.isArray(list)) continue;
        const match = list.find(
          (rel) =>
            rel?.COLUMN_NAME &&
            rel.COLUMN_NAME.toLowerCase() === positionFieldName.toLowerCase(),
        );
        if (match?.REFERENCED_TABLE_NAME && match?.REFERENCED_COLUMN_NAME) {
          relationInfo = {
            table: match.REFERENCED_TABLE_NAME,
            column: match.REFERENCED_COLUMN_NAME,
            filterColumn: match.filterColumn,
            filterValue: match.filterValue,
          };
          break;
        }
      }

      if (!relationInfo) {
        setRelationPositionLabels(new Map());
        return;
      }

      const params = new URLSearchParams({ table: relationInfo.table });
      if (relationInfo.filterColumn) {
        params.set('filterColumn', relationInfo.filterColumn);
      }
      if (relationInfo.filterValue !== undefined && relationInfo.filterValue !== null) {
        params.set('filterValue', String(relationInfo.filterValue));
      }
      if (relationInfo.column) {
        params.set('targetColumn', relationInfo.column);
      }
      const cfgRes = await fetch(`/api/display_fields?${params.toString()}`, {
        credentials: 'include',
        skipErrorToast: true,
        skipLoader: true,
      });
      const cfg = cfgRes.ok ? await cfgRes.json().catch(() => ({})) : {};
      const idField =
        (typeof cfg?.idField === 'string' && cfg.idField.trim()) ||
        relationInfo.column;
      const displayFields = Array.isArray(cfg?.displayFields) ? cfg.displayFields : [];

      const rows = await fetchAllRows(relationInfo.table);
      if (canceled) return;
      const labelMap = new Map();
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const idValue = normalizePositionId(row[idField] ?? row[relationInfo.column]);
        if (!idValue) return;
        if (!positionValues.has(idValue)) return;
        const label = buildDisplayLabel(row, { idField, displayFields });
        if (label) labelMap.set(idValue, label);
      });

      if (!canceled) setRelationPositionLabels(labelMap);
    };

    loadPositionLabels();

    return () => {
      canceled = true;
    };
  }, [assignments, fetchAllRows, positionFieldName]);

  const shouldShowEmpty = !loading && !error && assignments.length === 0;

  const resolvedPositionLabelMap = useMemo(() => {
    const merged = new Map(positionLabelMap);
    relationPositionLabels.forEach((label, id) => {
      if (label) merged.set(id, label);
    });
    return merged;
  }, [positionLabelMap, relationPositionLabels]);

  const groupedAssignments = useMemo(() => {
    const groups = new Map();
    assignments.forEach((entry) => {
      const positionValue = getRowFieldValue(entry.row, positionFieldName);
      const normalizedPosition = normalizePositionId(positionValue) || 'Unknown';
      if (!groups.has(normalizedPosition)) groups.set(normalizedPosition, []);
      groups.get(normalizedPosition).push(entry);
    });
    return Array.from(groups.entries()).map(([positionId, entries]) => {
      const columnSet = new Set(['table']);
      entries.forEach(({ row }) => {
        const normalizedTable = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
        const meta = normalizedTable
          ? dutyTransactionMeta.metaByTable.get(normalizedTable)
          : null;
        const dashboardFields = meta?.fields;
        const fieldList =
          dashboardFields && dashboardFields.length > 0
            ? dashboardFields
            : Object.keys(row || {});
        fieldList.forEach((key) => {
          if (key === positionFieldName) return;
          const value = getRowFieldValue(row, key);
          if (isEmptyDisplayValue(value)) return;
          columnSet.add(key);
        });
      });
      const positionLabel =
        positionId !== 'Unknown' ? resolvedPositionLabelMap.get(positionId) : null;
      return {
        positionId,
        positionLabel: positionLabel || positionId,
        entries,
        columns: Array.from(columnSet),
      };
    });
  }, [
    assignments,
    dutyTransactionMeta.metaByTable,
    positionFieldName,
    resolvedPositionLabelMap,
  ]);

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <h3 style={styles.title}>Duty Assignments</h3>
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
                          {column === 'table' ? 'Duty Assignment' : column}
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
                          const entryTypeId = normalizeText(
                            entry.row?.UITransType ?? entry.row?.transType ?? entry.row?.id,
                          );
                          const typeLabel = entryTypeId
                            ? dutyTransactionMeta.typeLabelMap.get(entryTypeId)
                            : null;
                          const tableMeta = normalizedTable
                            ? dutyTransactionMeta.metaByTable.get(normalizedTable)
                            : null;
                          const tableLabel = tableMeta?.labels?.[0] || null;
                          const value =
                            column === 'table'
                              ? typeLabel || tableLabel || entry.table
                              : getRowFieldValue(entry.row, column);
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

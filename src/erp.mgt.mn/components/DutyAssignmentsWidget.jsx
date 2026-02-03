import { useContext, useEffect, useMemo, useState } from 'react';
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
  const [allowedForms, setAllowedForms] = useState({});
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const dashboardFieldsByTable = useMemo(() => {
    const map = new Map();
    codeTransactions.forEach((row) => {
      if (!isDutyNotificationRow(row, dutyNotificationConfig)) return;
      const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
      if (!table) return;
      const name = normalizeText(getRowValue(row, TRANSACTION_NAME_KEYS));
      const info =
        (name && allowedFormMaps.nameMap.get(name)) ||
        allowedFormMaps.tableMap.get(table) ||
        null;
      if (!info) return;
      const fields = resolveDashboardFields(info);
      const existing = map.get(table);
      if (!existing || (existing.length === 0 && fields.length > 0)) {
        map.set(table, fields);
      }
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

  const shouldShowEmpty = !loading && !error && assignments.length === 0;

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
        const dashboardFields = normalizedTable
          ? dashboardFieldsByTable.get(normalizedTable)
          : null;
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
        positionId !== 'Unknown' ? positionLabelMap.get(positionId) : null;
      return {
        positionId,
        positionLabel: positionLabel || positionId,
        entries,
        columns: Array.from(columnSet),
      };
    });
  }, [assignments, dashboardFieldsByTable, positionFieldName]);

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
                          const value =
                            column === 'table'
                              ? dutyLabelsByTable.get(normalizedTable) || entry.table
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

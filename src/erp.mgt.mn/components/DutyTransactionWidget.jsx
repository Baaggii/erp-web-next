import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

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

function normalizeFieldName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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

function normalizeWorkplaceId(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim();
}

function normalizePositionId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function buildRowLabel(row, displayConfig) {
  if (!row || typeof row !== 'object') return '';
  const parts = [];
  const idField = displayConfig?.idField;
  if (idField && row[idField] !== undefined && row[idField] !== null && row[idField] !== '') {
    parts.push(row[idField]);
  }
  const displayFields = Array.isArray(displayConfig?.displayFields)
    ? displayConfig.displayFields
    : [];
  displayFields.forEach((field) => {
    if (typeof field !== 'string') return;
    const value = row[field];
    if (value !== undefined && value !== null && value !== '') {
      parts.push(value);
    }
  });
  const normalized = parts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => (typeof part === 'string' ? part : String(part)));
  if (normalized.length > 0) return normalized.join(' - ');
  const fallback = Object.values(row)
    .filter((part) => part !== undefined && part !== null && part !== '')
    .slice(0, 2)
    .map((part) => (typeof part === 'string' ? part : String(part)));
  return fallback.join(' - ');
}

export default function DutyTransactionWidget() {
  const { session, user, workplace, workplacePositionMap } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const { t } = useTranslation(['translation']);
  const dutyFieldName = generalConfig?.plan?.dutyFieldName?.trim();
  const [codeTransactions, setCodeTransactions] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const positionIds = useMemo(() => {
    const ids = new Set();
    const currentWorkplaceId = normalizeWorkplaceId(
      workplace ?? session?.workplace_id ?? session?.workplaceId,
    );
    const assignments = Array.isArray(session?.workplace_assignments)
      ? session.workplace_assignments
      : [];

    const addPosition = (value) => {
      const positionId = normalizePositionId(value);
      if (positionId) ids.add(positionId);
    };

    const addWorkplaceEntryPositions = (entry) => {
      if (!entry) return;
      if (Array.isArray(entry)) {
        entry.forEach((item) => addPosition(item?.positionId ?? item?.position_id ?? item));
        return;
      }
      addPosition(entry?.positionId ?? entry?.position_id ?? entry);
    };

    if (currentWorkplaceId) {
      const direct =
        workplacePositionMap?.[currentWorkplaceId] ||
        workplacePositionMap?.[String(currentWorkplaceId)];
      addWorkplaceEntryPositions(direct);

      assignments.forEach((entry) => {
        const entryWorkplaceId = normalizeWorkplaceId(
          entry?.workplace_id ?? entry?.workplaceId ?? entry?.id,
        );
        if (!entryWorkplaceId || entryWorkplaceId !== currentWorkplaceId) return;
        addPosition(
          entry?.workplace_position_id ??
            entry?.workplacePositionId ??
            entry?.position_id ??
            entry?.positionId ??
            entry?.position,
        );
      });

      addPosition(session?.workplace_position_id ?? session?.workplacePositionId);
    } else {
      if (workplacePositionMap && typeof workplacePositionMap === 'object') {
        Object.values(workplacePositionMap).forEach((entry) => {
          addWorkplaceEntryPositions(entry);
        });
      }
      assignments.forEach((entry) => {
        addPosition(
          entry?.workplace_position_id ??
            entry?.workplacePositionId ??
            entry?.position_id ??
            entry?.positionId ??
            entry?.position,
        );
      });
    }

    if (ids.size === 0) {
      addPosition(
        session?.employment_position_id ??
          session?.position_id ??
          session?.position ??
          user?.position,
      );
    }

    return Array.from(ids);
  }, [session, user, workplace, workplacePositionMap]);

  const dutyTransactions = useMemo(() => {
    if (!dutyFieldName) return [];
    return codeTransactions.filter((row) => {
      const value = getRowFieldValue(row, dutyFieldName);
      if (value === undefined || value === null || value === '') return false;
      return normalizeFlagValue(value);
    });
  }, [codeTransactions, dutyFieldName]);

  const fetchDisplayConfig = useCallback(async (table, signal) => {
    if (!table) return { idField: undefined, displayFields: [] };
    try {
      const params = new URLSearchParams({ table });
      const res = await fetch(`/api/display_fields?${params.toString()}`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) return { idField: undefined, displayFields: [] };
      const data = await res.json().catch(() => ({}));
      return {
        idField: typeof data?.idField === 'string' ? data.idField : undefined,
        displayFields: Array.isArray(data?.displayFields) ? data.displayFields : [],
      };
    } catch (err) {
      if (signal?.aborted) return { idField: undefined, displayFields: [] };
      return { idField: undefined, displayFields: [] };
    }
  }, []);

  const fetchDutyRows = useCallback(async (table, positionIdList, idField, signal) => {
    if (!table) return [];
    if (!Array.isArray(positionIdList) || positionIdList.length === 0) return [];
    const rows = [];
    const rowKeys = new Set();
    await Promise.all(
      positionIdList.map(async (positionId) => {
        const params = new URLSearchParams();
        params.set('perPage', '200');
        params.set('position_id', positionId);
        try {
          const res = await fetch(
            `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
            {
              credentials: 'include',
              signal,
              skipErrorToast: true,
              skipLoader: true,
            },
          );
          if (!res.ok) return;
          const data = await res.json().catch(() => ({}));
          const fetchedRows = Array.isArray(data?.rows) ? data.rows : [];
          fetchedRows.forEach((row) => {
            const keyValue =
              idField && row?.[idField] !== undefined && row?.[idField] !== null
                ? `${row[idField]}`
                : JSON.stringify(row);
            if (rowKeys.has(keyValue)) return;
            rowKeys.add(keyValue);
            rows.push(row);
          });
        } catch (err) {
          if (!signal?.aborted) return;
        }
      }),
    );
    return rows;
  }, []);

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();
    if (!dutyFieldName) {
      setCodeTransactions([]);
      return () => controller.abort();
    }
    fetch('/api/tables/code_transaction?perPage=500', {
      credentials: 'include',
      signal: controller.signal,
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
      controller.abort();
    };
  }, [dutyFieldName]);

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();
    if (!dutyFieldName) {
      setEntries([]);
      return () => controller.abort();
    }
    const loadEntries = async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          dutyTransactions.map(async (row) => {
            const table = getRowValue(row, TRANSACTION_TABLE_KEYS);
            if (!table) return null;
            const name = getRowValue(row, TRANSACTION_NAME_KEYS) || table;
            const displayConfig = await fetchDisplayConfig(table, controller.signal);
            const rows = await fetchDutyRows(
              table,
              positionIds,
              displayConfig?.idField,
              controller.signal,
            );
            return {
              table,
              name,
              rows,
              displayConfig,
            };
          }),
        );
        if (!canceled) {
          setEntries(results.filter(Boolean));
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    loadEntries();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [dutyFieldName, dutyTransactions, fetchDisplayConfig, fetchDutyRows, positionIds]);

  if (!dutyFieldName) return null;

  const hasRows = entries.some((entry) => entry?.rows?.length);

  return (
    <div>
      {loading && <p>{t('loading', 'Loading…')}</p>}
      {!loading && entries.length === 0 && (
        <p>{t('no_duty_transactions', 'No duty transactions configured.')}</p>
      )}
      {!loading && entries.length > 0 && !hasRows && (
        <p>{t('no_duties_found', 'No duties found for your position(s).')}</p>
      )}
      {entries.map((entry) => (
        <div key={entry.table} style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.25rem' }}>{entry.name}</h3>
          {entry.rows.length === 0 ? (
            <p style={{ marginTop: 0, color: '#666' }}>
              {t('no_duties_for_transaction', 'No duties found for this transaction.')}
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {entry.rows.map((row, index) => {
                const label = buildRowLabel(row, entry.displayConfig);
                const key =
                  entry.displayConfig?.idField && row?.[entry.displayConfig.idField] !== undefined
                    ? `${entry.table}-${row[entry.displayConfig.idField]}`
                    : `${entry.table}-${index}`;
                return <li key={key}>{label || t('duty_row', 'Duty record')}</li>;
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

import { useContext, useEffect, useMemo, useState } from 'react';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { AuthContext } from '../context/AuthContext.jsx';
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

function normalizePositionId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
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

function buildPositionIdSet({
  position,
  workplace,
  workplacePositionMap,
  session,
}) {
  const ids = new Set();
  if (workplace !== null && workplace !== undefined) {
    const resolved = resolveWorkplacePositionForContext({
      workplaceId: workplace,
      session,
      workplacePositionMap,
    });
    const resolvedId = normalizePositionId(resolved?.positionId);
    if (resolvedId) ids.add(resolvedId);
  }

  if (ids.size === 0 && workplacePositionMap && typeof workplacePositionMap === 'object') {
    Object.values(workplacePositionMap).forEach((entry) => {
      const entryId = normalizePositionId(entry?.positionId);
      if (entryId) ids.add(entryId);
    });
  }

  if (ids.size === 0) {
    const fallback = normalizePositionId(position);
    if (fallback) ids.add(fallback);
  }

  return ids;
}

export default function PlanDutyWidget() {
  const generalConfig = useGeneralConfig();
  const { position, workplace, workplacePositionMap, session } = useContext(AuthContext);
  const [codeTransactions, setCodeTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const dutyFieldName = generalConfig?.plan?.dutyFieldName?.trim() || '';

  useEffect(() => {
    let canceled = false;
    setIsLoading(true);
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
      })
      .finally(() => {
        if (!canceled) setIsLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  const positionIds = useMemo(
    () =>
      buildPositionIdSet({
        position,
        workplace,
        workplacePositionMap,
        session,
      }),
    [position, session, workplace, workplacePositionMap],
  );

  const dutyRows = useMemo(() => {
    if (!dutyFieldName) return [];
    const normalizedPositions = new Set(Array.from(positionIds));
    return codeTransactions.filter((row) => {
      const dutyValue = getRowFieldValue(row, dutyFieldName);
      if (!normalizeFlagValue(dutyValue)) return false;
      if (normalizedPositions.size === 0) return false;
      const rowPosition = getRowFieldValue(row, 'position_id');
      const normalizedRowPosition = normalizePositionId(rowPosition);
      if (!normalizedRowPosition) return false;
      return normalizedPositions.has(normalizedRowPosition);
    });
  }, [codeTransactions, dutyFieldName, positionIds]);

  if (isLoading) {
    return <div>Loading duties…</div>;
  }

  if (!dutyFieldName) {
    return <div>Configure a duty field name in General Configuration → Plan.</div>;
  }

  if (positionIds.size === 0) {
    return <div>No position IDs are available for this user.</div>;
  }

  if (dutyRows.length === 0) {
    return <div>No duties found for the current positions.</div>;
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Duties</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>
                Transaction
              </th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>
                Table
              </th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>
                Position ID
              </th>
            </tr>
          </thead>
          <tbody>
            {dutyRows.map((row) => {
              const name = getRowValue(row, TRANSACTION_NAME_KEYS) ?? 'Unnamed transaction';
              const table = getRowValue(row, TRANSACTION_TABLE_KEYS) ?? 'Unknown table';
              const rowPosition = getRowFieldValue(row, 'position_id') ?? '';
              const rowKey = row?.transaction_id ?? row?.id ?? `${name}-${table}-${rowPosition}`;
              return (
                <tr key={rowKey}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{name}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{table}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                    {rowPosition || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

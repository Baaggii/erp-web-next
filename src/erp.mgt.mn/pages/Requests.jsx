// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { diff } from 'jsondiffpatch';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { debugLog } from '../utils/debug.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import { translateToMn } from '../utils/translateToMn.js';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import safeRequest from '../utils/safeRequest.js';
import { useSearchParams } from 'react-router-dom';
import DateRangePicker from '../components/DateRangePicker.jsx';
import ReportSnapshotViewer from '../components/ReportSnapshotViewer.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import {
  normalizeSnapshotRecord,
  resolveSnapshotSource,
} from '../utils/normalizeSnapshot.js';

function ch(n) {
  return Math.round(n * 8);
}

const MAX_WIDTH = ch(40);

function getAverageLength(values) {
  const list = values
    .filter((v) => v !== null && v !== undefined)
    .map((v) =>
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    )
    .slice(0, 20);
  if (list.length === 0) return 0;
  return Math.round(list.reduce((s, v) => s + v.length, 0) / list.length);
}

function renderValue(val) {
  const style = { whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
  if (typeof val === 'object' && val !== null) {
    return (
      <pre style={{ ...style, margin: 0 }}>
        {JSON.stringify(val, null, 2)}
      </pre>
    );
  }
  if (
    typeof val === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
  ) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      val = formatTimestamp(d);
    }
  }
  return <span style={style}>{String(val ?? '')}</span>;
}

function normalizeEmpId(id) {
  return String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/^0+/, '');
}

const approvalNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function formatDateTimeDisplay(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return formatTimestamp(d);
  if (typeof value === 'string') return value;
  return String(value);
}

function formatReportSnapshotValue(value, column, fieldTypeMap = {}) {
  if (value === null || value === undefined) return '';
  const type = fieldTypeMap?.[column];
  if (type === 'date' || type === 'datetime') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return formatTimestamp(d);
  }
  if (typeof value === 'number') {
    return approvalNumberFormatter.format(value);
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return formatTimestamp(d);
    }
    return value;
  }
  return String(value);
}

function renderReportSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return <p>No snapshot captured.</p>;
  }
  return (
    <ReportSnapshotViewer
      snapshot={snapshot}
      emptyMessage="No snapshot captured."
      formatValue={(value, column, fieldTypeMap) =>
        formatReportSnapshotValue(value, column, fieldTypeMap)
      }
    />
  );
}

function renderTransactionSnapshot(record, fallbackColumns = []) {
  const snapshot = record?.snapshot;
  if (!snapshot || typeof snapshot !== 'object') {
    return <p style={{ margin: '0.25rem 0 0' }}>Snapshot unavailable.</p>;
  }
  const explicitColumns = Array.isArray(record?.snapshotColumns)
    ? record.snapshotColumns.filter(Boolean)
    : [];
  const columns =
    explicitColumns.length > 0
      ? explicitColumns
      : fallbackColumns.length > 0
      ? fallbackColumns
      : Object.keys(snapshot);
  if (!columns.length) {
    return <p style={{ margin: '0.25rem 0 0' }}>Snapshot unavailable.</p>;
  }
  const fieldTypes = record?.snapshotFieldTypeMap || record?.fieldTypeMap || {};
  return (
    <table
      style={{
        borderCollapse: 'collapse',
        width: '100%',
      }}
    >
      <tbody>
        {columns.map((col) => (
          <tr key={col}>
            <th
              style={{
                textAlign: 'left',
                padding: '0.25rem',
                border: '1px solid #d1d5db',
                background: '#f3f4f6',
                width: '35%',
              }}
            >
              {col}
            </th>
            <td
              style={{
                padding: '0.25rem',
                border: '1px solid #d1d5db',
              }}
            >
              {formatReportSnapshotValue(snapshot?.[col], col, fieldTypes)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const APPROVAL_TRANSACTION_IGNORED_KEYS = new Set([
  'parameters',
  'snapshot',
  'snapshotColumns',
  'snapshot_columns',
  'snapshotFieldTypeMap',
  'snapshot_field_type_map',
  'fieldTypeMap',
  'field_type_map',
  'archive',
  'snapshotArchive',
  'snapshot_archive',
  'requestId',
  'request_id',
  'lockRequestId',
  'lock_request_id',
  'metadata',
  'report_metadata',
  'proposed_data',
  'excludedTransactions',
  'excluded_transactions',
  'lockCandidates',
  'lock_candidates',
  'lockBundle',
  'lock_bundle',
  'rows',
  'columns',
  'fieldTypes',
  'field_types',
  'rowCount',
  'row_count',
  'count',
  'total',
]);

function collectApprovalTransactionsFromSource(
  source,
  results,
  visited,
  fallbackTable = '',
) {
  if (source === null || source === undefined) return;
  if (Array.isArray(source)) {
    source.forEach((item) =>
      collectApprovalTransactionsFromSource(item, results, visited, fallbackTable),
    );
    return;
  }
  if (typeof source !== 'object') {
    if (
      fallbackTable &&
      (typeof source === 'string' || typeof source === 'number')
    ) {
      results.push({ table: fallbackTable, recordId: source });
    }
    return;
  }
  if (visited.has(source)) return;
  visited.add(source);
  const tableCandidate =
    source.table ||
    source.tableName ||
    source.table_name ||
    source.lock_table ||
    source.lockTable ||
    fallbackTable ||
    '';
  const rawId =
    source.recordId ??
    source.record_id ??
    source.id ??
    source.recordID ??
    source.RecordId ??
    source.lock_record_id ??
    source.lockRecordId;
  if (
    tableCandidate &&
    rawId !== undefined &&
    rawId !== null &&
    (typeof rawId === 'string' || typeof rawId === 'number')
  ) {
    results.push({ ...source, table: tableCandidate, recordId: rawId });
    return;
  }
  const idList =
    source.recordIds ||
    source.record_ids ||
    source.recordIDs ||
    source.ids ||
    source.items ||
    source.records ||
    source.lock_record_ids ||
    source.lockRecordIds;
  if (tableCandidate && Array.isArray(idList) && idList.length) {
    idList.forEach((item) => {
      if (item && typeof item === 'object') {
        collectApprovalTransactionsFromSource(
          { ...item, table: tableCandidate },
          results,
          visited,
          tableCandidate,
        );
      } else if (item !== undefined && item !== null) {
        collectApprovalTransactionsFromSource(
          item,
          results,
          visited,
          tableCandidate,
        );
      }
    });
    return;
  }
  Object.keys(source).forEach((key) => {
    if (['table', 'tableName', 'table_name'].includes(key)) return;
    if (
      [
        'recordId',
        'record_id',
        'recordIds',
        'record_ids',
        'recordIDs',
        'recordID',
        'ids',
        'items',
        'records',
      ].includes(key)
    ) {
      return;
    }
    if (APPROVAL_TRANSACTION_IGNORED_KEYS.has(key)) return;
    const child = source[key];
    const nextFallback =
      tableCandidate ||
      fallbackTable ||
      (Array.isArray(child) || (child && typeof child === 'object') ? key : '');
    collectApprovalTransactionsFromSource(
      child,
      results,
      visited,
      nextFallback,
    );
  });
}

function gatherApprovalTransactionsFromSources(sources = []) {
  const results = [];
  const visited = new WeakSet();
  sources.forEach((source) =>
    collectApprovalTransactionsFromSource(source, results, visited, ''),
  );
  return results;
}

function normalizeApprovalTransaction(tx) {
  if (!tx || typeof tx !== 'object') return null;
  const tableName =
    tx.table ||
    tx.tableName ||
    tx.table_name ||
    tx.lock_table ||
    tx.lockTable ||
    '—';
  const rawId =
    tx.recordId ??
    tx.record_id ??
    tx.id ??
    tx.recordID ??
    tx.RecordId ??
    tx.lock_record_id ??
    tx.lockRecordId;
  if (!tableName || rawId === undefined || rawId === null) return null;
  const recordId = String(rawId);
  const key = `${tableName}#${recordId}`;
  const label = tx.label || tx.description || tx.note || '';
  const reason =
    tx.reason ||
    tx.justification ||
    tx.explanation ||
    tx.exclude_reason ||
    tx.lock_reason ||
    tx.lockReason ||
    '';
  const rawSnapshot =
    resolveSnapshotSource(tx) ||
    (tx.snapshot &&
    typeof tx.snapshot === 'object' &&
    !Array.isArray(tx.snapshot)
      ? tx.snapshot
      : null);
  const {
    row: snapshot,
    columns: derivedColumns,
    fieldTypeMap,
  } = normalizeSnapshotRecord(rawSnapshot || {});
  let snapshotColumns = Array.isArray(tx.snapshotColumns)
    ? tx.snapshotColumns
    : Array.isArray(tx.snapshot_columns)
    ? tx.snapshot_columns
    : Array.isArray(tx.columns)
    ? tx.columns
    : [];
  snapshotColumns = snapshotColumns
    .map((col) => (col === null || col === undefined ? '' : String(col)))
    .filter(Boolean);
  if (!snapshotColumns.length) {
    snapshotColumns = derivedColumns;
  }
  const snapshotFieldTypeMap =
    tx.snapshotFieldTypeMap ||
    tx.snapshot_field_type_map ||
    tx.fieldTypeMap ||
    tx.field_type_map ||
    fieldTypeMap ||
    {};
  const lockStatus = tx.lockStatus || tx.status || '';
  const lockedBy = tx.lockedBy || tx.locked_by || '';
  const lockedAt = tx.lockedAt || tx.locked_at || '';
  const locked = Boolean(tx.locked || tx.is_locked || tx.isLocked);
  return {
    key,
    tableName,
    recordId,
    label,
    reason,
    snapshot,
    snapshotColumns,
    snapshotFieldTypeMap,
    lockStatus,
    lockedBy,
    lockedAt,
    locked,
  };
}

function normalizeApprovalTransactionList(list = []) {
  const map = new Map();
  list.forEach((tx) => {
    const normalized = normalizeApprovalTransaction(tx);
    if (!normalized) return;
    map.set(normalized.key, normalized);
  });
  return Array.from(map.values());
}

function buildApprovalTransactionBuckets(list = []) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const bucketMap = new Map();
  list.forEach((item) => {
    if (!item) return;
    const bucketKey = item.tableName || '—';
    if (!bucketMap.has(bucketKey)) {
      bucketMap.set(bucketKey, []);
    }
    bucketMap.get(bucketKey).push(item);
  });
  return Array.from(bucketMap.entries())
    .map(([tableName, records]) => {
      const sortedRecords = records
        .slice()
        .sort((a, b) => String(a.recordId).localeCompare(String(b.recordId)));
      const columnSet = new Set();
      sortedRecords.forEach((record) => {
        if (Array.isArray(record.snapshotColumns) && record.snapshotColumns.length) {
          record.snapshotColumns.forEach((col) => {
            if (col) columnSet.add(col);
          });
        } else if (record.snapshot && typeof record.snapshot === 'object') {
          Object.keys(record.snapshot).forEach((col) => {
            if (col) columnSet.add(col);
          });
        }
      });
      return {
        tableName,
        records: sortedRecords,
        columns: Array.from(columnSet),
      };
    })
    .sort((a, b) => String(a.tableName).localeCompare(String(b.tableName)));
}

function ReportApprovalDetails({ meta, requestId }) {
  const [expandedSnapshots, setExpandedSnapshots] = useState({});

  useEffect(() => {
    setExpandedSnapshots({});
  }, [meta]);

  const toggleSnapshot = useCallback((key) => {
    setExpandedSnapshots((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  if (!meta || typeof meta !== 'object') {
    return <p>No report metadata available.</p>;
  }

  const paramEntries = Object.entries(meta.parameters || {});

  const {
    transactionBuckets,
    excludedBuckets,
    hasSelectedDetails,
    hasExcludedDetails,
  } = useMemo(() => {
    const transactionSources = [
      meta.transactions,
      meta.transaction_list,
      meta.transactionList,
      meta.transaction_map,
      meta.transactionMap,
      meta.lockCandidates,
      meta.lock_candidates,
      meta.lockBundle,
      meta.lock_bundle,
      meta.lockBundle?.locks,
      meta.lock_bundle?.locks,
      meta.lockBundle?.records,
      meta.lock_bundle?.records,
      meta.lockBundle?.items,
      meta.lock_bundle?.items,
    ];
    const excludedSources = [
      meta.excludedTransactions,
      meta.excluded_transactions,
      meta.excludedTransactionList,
      meta.excluded_transaction_list,
      meta.excludedLockBundle,
      meta.excluded_lock_bundle,
    ];
    const normalizedTransactions = normalizeApprovalTransactionList(
      gatherApprovalTransactionsFromSources(transactionSources),
    );
    const normalizedExcluded = normalizeApprovalTransactionList(
      gatherApprovalTransactionsFromSources(excludedSources),
    );
    return {
      transactionBuckets: buildApprovalTransactionBuckets(normalizedTransactions),
      excludedBuckets: buildApprovalTransactionBuckets(normalizedExcluded),
      hasSelectedDetails: normalizedTransactions.some((record) => record?.label),
      hasExcludedDetails: normalizedExcluded.some((record) => record?.label),
    };
  }, [meta]);

  const rowCount =
    typeof meta.snapshot?.rowCount === 'number'
      ? meta.snapshot.rowCount
      : Array.isArray(meta.snapshot?.rows)
      ? meta.snapshot.rows.length
      : null;

  const archiveMeta =
    meta.archive || meta.snapshotArchive || meta.snapshot_archive || null;
  const archiveRequestId =
    archiveMeta?.requestId ?? archiveMeta?.request_id ?? requestId ?? null;
  const archiveUrl = archiveRequestId
    ? `/api/report_approvals/${encodeURIComponent(archiveRequestId)}/file`
    : null;

  const formatArchiveSize = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = num;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const decimals = size >= 100 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(decimals)} ${units[unitIndex]}`;
  };

  const renderBucket = (bucket, listType, showDetailsColumn) => {
    const count = bucket.records.length;
    const summary = `${bucket.tableName} — ${count} transaction${
      count === 1 ? '' : 's'
    }`;
    const shouldDefaultOpen =
      listType === 'selected'
        ? transactionBuckets.length === 1
        : excludedBuckets.length === 1;
    return (
      <details
        key={`${listType}-${bucket.tableName}`}
        style={{ margin: '0.25rem 0' }}
        open={shouldDefaultOpen}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          {summary}
        </summary>
        <div style={{ margin: '0.25rem 0 0', overflowX: 'auto' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              minWidth: showDetailsColumn ? '40rem' : '32rem',
            }}
          >
            <thead style={{ background: '#e5e7eb' }}>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    width: '4rem',
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Record ID
                </th>
                {showDetailsColumn && (
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.25rem',
                      border: '1px solid #d1d5db',
                    }}
                  >
                    Details
                  </th>
                )}
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    minWidth: '12rem',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    minWidth: '12rem',
                  }}
                >
                  Snapshot
                </th>
              </tr>
            </thead>
            <tbody>
              {bucket.records.map((record, idx) => {
                const detailKey = `${listType}|${bucket.tableName}|${record.key}`;
                const isExpanded = Boolean(expandedSnapshots[detailKey]);
                const hasSnapshot = Boolean(
                  record.snapshot && typeof record.snapshot === 'object',
                );
                const statusColor =
                  listType === 'excluded' ? '#b91c1c' : '#047857';
                const statusText =
                  listType === 'excluded' ? 'Excluded' : 'Included';
                const statusDetails =
                  listType === 'excluded'
                    ? record.reason
                      ? `Reason: ${record.reason}`
                      : 'Reason not provided.'
                    : record.reason || 'Submitted for locking.';
                return (
                  <tr key={detailKey}>
                    <td
                      style={{
                        padding: '0.25rem',
                        border: '1px solid #d1d5db',
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{
                        padding: '0.25rem',
                        border: '1px solid #d1d5db',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {record.recordId}
                    </td>
                    {showDetailsColumn && (
                      <td
                        style={{
                          padding: '0.25rem',
                          border: '1px solid #d1d5db',
                        }}
                      >
                        {record.label || '—'}
                      </td>
                    )}
                    <td
                      style={{
                        padding: '0.25rem',
                        border: '1px solid #d1d5db',
                      }}
                    >
                      <div
                        style={{
                          color: statusColor,
                          fontWeight: 'bold',
                        }}
                      >
                        {statusText}
                      </div>
                      <div
                        style={{
                          marginTop: '0.125rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        {statusDetails}
                      </div>
                      {record.lockStatus && (
                        <div
                          style={{
                            marginTop: '0.125rem',
                            fontSize: '0.875rem',
                            color: '#6b7280',
                          }}
                        >
                          Status: {record.lockStatus}
                        </div>
                      )}
                      {record.locked && (
                        <div
                          style={{
                            marginTop: '0.125rem',
                            fontSize: '0.875rem',
                            color: '#6b7280',
                          }}
                        >
                          Locked by {record.lockedBy || 'unknown'}
                          {record.lockedAt
                            ? ` on ${formatDateTimeDisplay(record.lockedAt)}`
                            : ''}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '0.25rem',
                        border: '1px solid #d1d5db',
                      }}
                    >
                      {hasSnapshot ? (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleSnapshot(detailKey)}
                            style={{ fontSize: '0.85rem' }}
                          >
                            {isExpanded ? 'Hide snapshot' : 'View snapshot'}
                          </button>
                          {isExpanded && (
                            <div style={{ marginTop: '0.25rem' }}>
                              {renderTransactionSnapshot(record, bucket.columns)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    );
  };

  return (
    <div>
      <div>
        <strong>Procedure:</strong> {meta.procedure || '—'}
      </div>
      {meta.executed_at && (
        <div>
          <strong>Executed:</strong> {formatDateTimeDisplay(meta.executed_at)}
        </div>
      )}
      {rowCount !== null && (
        <div>
          <strong>Rows in result:</strong> {rowCount}
        </div>
      )}
      <div style={{ marginTop: '0.5rem' }}>
        <strong>Parameters</strong>
        {paramEntries.length ? (
          <ul style={{ margin: '0.25rem 0 0 1.25rem' }}>
            {paramEntries.map(([key, value]) => (
              <li key={key}>
                {key}: {String(value ?? '')}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: '0.25rem 0 0' }}>No parameters provided.</p>
        )}
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <strong>Transactions</strong>
        {transactionBuckets.length ? (
          <div style={{ margin: '0.25rem 0 0' }}>
            {transactionBuckets.map((bucket) =>
              renderBucket(bucket, 'selected', hasSelectedDetails),
            )}
          </div>
        ) : (
          <p style={{ margin: '0.25rem 0 0' }}>No transactions provided.</p>
        )}
      </div>
      {archiveMeta && archiveUrl && (
        <div style={{ marginTop: '0.5rem' }}>
          <a href={archiveUrl} target="_blank" rel="noopener noreferrer">
            View archived report
          </a>
          {archiveMeta.archivedAt && (
            <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
              archived {formatDateTimeDisplay(archiveMeta.archivedAt)}
            </span>
          )}
          {archiveMeta.byteSize && (
            <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
              {formatArchiveSize(archiveMeta.byteSize)}
            </span>
          )}
        </div>
      )}
      <div style={{ marginTop: '0.5rem' }}>
        <strong>Excluded transactions</strong>
        {excludedBuckets.length ? (
          <div style={{ margin: '0.25rem 0 0' }}>
            {excludedBuckets.map((bucket) =>
              renderBucket(bucket, 'excluded', hasExcludedDetails),
            )}
          </div>
        ) : (
          <p style={{ margin: '0.25rem 0 0' }}>No transactions excluded.</p>
        )}
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <strong>Snapshot</strong>
        {renderReportSnapshot(meta.snapshot)}
      </div>
    </div>
  );
}

export default function RequestsPage() {
  const { user, session } = useAuth();
  const {
    incoming: incomingCounts,
    outgoing: outgoingCounts,
    markSeen,
    workflows,
  } = usePendingRequests();

  const hasSupervisor =
    Number(session?.senior_empid) > 0 || Number(session?.senior_plan_empid) > 0;
  const seniorEmpId = session && user?.empid && !hasSupervisor ? user.empid : null;

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const initialStatus = searchParams.get('status');
  const initialDateFrom = (searchParams.get('date_from') || '').trim();
  const initialDateTo = (searchParams.get('date_to') || '').trim();

  // Always default to the user's own outgoing requests. Seniors can
  // still switch to the incoming tab manually.
  const [activeTab, setActiveTab] = useState(
    initialTab === 'incoming' ? 'incoming' : 'outgoing',
  );
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [incomingLoading, setIncomingLoading] = useState(true);
  const [outgoingLoading, setOutgoingLoading] = useState(false);
  const [incomingError, setIncomingError] = useState(null);
  const [outgoingError, setOutgoingError] = useState(null);

  // filters
  const [requestedEmpid, setRequestedEmpid] = useState('');
  const [tableName, setTableName] = useState('');
  const [status, setStatus] = useState(initialStatus || 'pending');
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [requestType, setRequestType] = useState('');
  const [dateField, setDateField] = useState('created');
  const [incomingReloadKey, setIncomingReloadKey] = useState(0);
  const [outgoingReloadKey, setOutgoingReloadKey] = useState(0);
  const [incomingPage, setIncomingPage] = useState(1);
  const [outgoingPage, setOutgoingPage] = useState(1);

  const [perPage, setPerPage] = useState(2);
  const [incomingTotal, setIncomingTotal] = useState(0);
  const [outgoingTotal, setOutgoingTotal] = useState(0);

  const configCache = useRef({});

  const requests =
    activeTab === 'incoming' ? incomingRequests : outgoingRequests;
  const loading =
    activeTab === 'incoming' ? incomingLoading : outgoingLoading;
  const error = activeTab === 'incoming' ? incomingError : outgoingError;
  const currentPage = activeTab === 'incoming' ? incomingPage : outgoingPage;
  const total = activeTab === 'incoming' ? incomingTotal : outgoingTotal;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const requesterOptions = useMemo(() => {
    const set = new Set();
    incomingRequests.forEach((r) => set.add(String(r.emp_id).trim()));
    return Array.from(set);
  }, [incomingRequests]);

  const tableOptions = useMemo(() => {
    const set = new Set();
    requests.forEach((r) => set.add(r.table_name));
    return Array.from(set);
  }, [requests]);

  const allFields = useMemo(() => {
    const set = new Set();
    requests.forEach((r) => r.fields?.forEach((f) => set.add(f.name)));
    return Array.from(set);
  }, [requests]);

  const headerMap = useHeaderMappings(allFields);
  const ignoreNextDateChange = useRef(Boolean(initialDateFrom || initialDateTo));

  useEffect(() => {
    const queryDateFrom = (searchParams.get('date_from') || '').trim();
    const queryDateTo = (searchParams.get('date_to') || '').trim();
    if (!queryDateFrom && !queryDateTo) return;

    const stateDateFrom = (dateFrom || '').trim();
    const stateDateTo = (dateTo || '').trim();

    if (queryDateFrom !== stateDateFrom || queryDateTo !== stateDateTo) {
      ignoreNextDateChange.current = true;
      setDateFrom(queryDateFrom);
      setDateTo(queryDateTo);
    }
  }, [searchParams, dateFrom, dateTo]);

  useEffect(() => {
    const queryDateFrom = (searchParams.get('date_from') || '').trim();
    const queryDateTo = (searchParams.get('date_to') || '').trim();
    if (!queryDateFrom && !queryDateTo && !dateFrom && !dateTo) {
      const today = formatTimestamp(new Date()).slice(0, 10);
      setDateFrom(today);
      setDateTo(today);
    }
  }, [dateFrom, dateTo, searchParams]);
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab === 'incoming' ? 'incoming' : 'outgoing');
    }
    const spStatus = searchParams.get('status');
    if (spStatus && spStatus !== status) {
      setStatus(spStatus);
    }
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    let changed = false;

    const applyParam = (key, value) => {
      const normalized = typeof value === 'string' ? value.trim() : value;
      const existing = params.get(key);
      if (normalized) {
        if (existing !== normalized) {
          params.set(key, normalized);
          return true;
        }
        return false;
      }
      if (existing !== null) {
        params.delete(key);
        return true;
      }
      return false;
    };

    changed = applyParam('tab', activeTab) || changed;
    changed = applyParam('status', status) || changed;
    changed = applyParam('date_from', dateFrom) || changed;
    changed = applyParam('date_to', dateTo) || changed;

    if (changed) {
      setSearchParams(params, { replace: true });
    }
  }, [activeTab, status, dateFrom, dateTo, searchParams, setSearchParams]);

  const handleDateRangeChange = useCallback(
    ({ start, end }) => {
      if (ignoreNextDateChange.current) {
        ignoreNextDateChange.current = false;
        return;
      }
      setDateFrom(start);
      setDateTo(end);
    },
    [ignoreNextDateChange, setDateFrom, setDateTo],
  );
  useEffect(() => {
    setIncomingPage(1);
  }, [status, requestedEmpid, tableName, requestType, dateFrom, dateTo, dateField]);
  useEffect(() => {
    setOutgoingPage(1);
  }, [status, tableName, requestType, dateFrom, dateTo, dateField]);
  async function enrichRequests(data) {
    const tableRequests = data.filter((r) => r.request_type !== 'report_approval');
    const tables = Array.from(new Set(tableRequests.map((r) => r.table_name)));
    await Promise.all(
      tables
        .filter((t) => !configCache.current[t])
        .map(async (t) => {
          try {
            const res = await safeRequest(`${API_BASE}/display_fields?table=${t}`, {
              credentials: 'include',
            });
            configCache.current[t] = res.ok
              ? await res.json()
              : { displayFields: [] };
          } catch {
            configCache.current[t] = { displayFields: [] };
          }
        }),
    );
    return data.map((req) => {
      if (req.request_type === 'report_approval') {
        return {
          ...req,
          original: null,
          fields: [],
          notes: '',
          response_status: null,
          error: null,
        };
      }
      const original = req.original || null;
      const cfg = configCache.current[req.table_name] || { displayFields: [] };
      const visible = cfg.displayFields?.length
        ? cfg.displayFields
        : Array.from(
            new Set([
              ...Object.keys(original || {}),
              ...Object.keys(req.proposed_data || {}),
            ]),
          );

      const fields = visible
        .map((name) => {
          const before = original ? original[name] : undefined;
          const after = req.proposed_data ? req.proposed_data[name] : undefined;
          const isComplex =
            (before && typeof before === 'object') ||
            (after && typeof after === 'object');
          let changed = false;
          if (isComplex) {
            changed = !!diff(before, after);
          } else {
            changed = JSON.stringify(before) !== JSON.stringify(after);
          }
          return { name, before, after, changed, isComplex };
        })
        .filter((f) => {
          const emptyBefore =
            f.before === undefined || f.before === null || f.before === '';
          const emptyAfter =
            f.after === undefined || f.after === null || f.after === '';
          return !(emptyBefore && emptyAfter);
        });

      return {
        ...req,
        original,
        fields,
        notes: '',
        response_status: null,
        error: null,
      };
    });
  }

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    if (activeTab === 'incoming' || activeTab === 'outgoing') {
      markSeen();
    }
  }, [activeTab, dateFrom, dateTo, markSeen]);

  useEffect(() => {
    if (activeTab !== 'incoming' || !seniorEmpId || !dateFrom || !dateTo)
      return;
    async function load() {
      debugLog('Loading pending requests');
      setIncomingLoading(true);
      setIncomingError(null);
      try {
        const params = new URLSearchParams({
          senior_empid: seniorEmpId,
          page: incomingPage,
          per_page: perPage,
        });
        if (status) params.append('status', status);
        if (requestedEmpid) params.append('requested_empid', requestedEmpid);
        if (tableName) params.append('table_name', tableName);
        if (requestType) params.append('request_type', requestType);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (dateField) params.append('date_field', dateField);
        const res = await safeRequest(
          `${API_BASE}/pending_request?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const enriched = await enrichRequests(data.rows || []);
        setIncomingRequests(enriched);
        setIncomingTotal(data.total || 0);
      } catch (err) {
        console.error(err);
        setIncomingError('Failed to load requests');
      } finally {
        setIncomingLoading(false);
      }
    }

      load();
    }, [
      activeTab,
      seniorEmpId,
      status,
      requestedEmpid,
      tableName,
      requestType,
      dateFrom,
      dateTo,
      dateField,
      incomingReloadKey,
      incomingPage,
      perPage,
    ]);

  useEffect(() => {
    if (activeTab !== 'outgoing' || !dateFrom || !dateTo) return;
    async function load() {
      setOutgoingLoading(true);
      setOutgoingError(null);
      try {
        const params = new URLSearchParams({
          page: outgoingPage,
          per_page: perPage,
        });
        if (status) params.append('status', status);
        if (tableName) params.append('table_name', tableName);
        if (requestType) params.append('request_type', requestType);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (dateField) params.append('date_field', dateField);
        const res = await safeRequest(
          `${API_BASE}/pending_request/outgoing?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const enriched = await enrichRequests(data.rows || []);
        setOutgoingRequests(enriched);
        setOutgoingTotal(data.total || 0);
      } catch (err) {
        console.error(err);
        setOutgoingError('Failed to load requests');
      } finally {
        setOutgoingLoading(false);
      }
    }
      load();
    }, [
      activeTab,
      user?.empid,
      status,
      tableName,
      requestType,
      dateFrom,
      dateTo,
      dateField,
      outgoingReloadKey,
      outgoingPage,
      perPage,
    ]);

  const updateNotes = (id, value) => {
    setIncomingRequests((reqs) =>
      reqs.map((r) => (r.request_id === id ? { ...r, notes: value } : r)),
    );
  };

  const respond = async (id, respStatus) => {
    const reqItem = incomingRequests.find((r) => r.request_id === id);
    if (!reqItem?.notes?.trim()) {
      setIncomingRequests((reqs) =>
        reqs.map((r) =>
          r.request_id === id ? { ...r, error: 'Response notes required' } : r,
        ),
      );
      return;
    }
    try {
      const res = await safeRequest(`${API_BASE}/pending_request/${id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: respStatus,
          response_notes: reqItem.notes,
          response_empid: user.empid,
          senior_empid: reqItem?.senior_empid || user.empid,
        }),
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error('Forbidden');
        throw new Error('Failed to respond');
      }
      setIncomingRequests((reqs) =>
        reqs.map((r) =>
          r.request_id === id
            ? {
                ...r,
                response_status: respStatus,
                status: respStatus,
                error: null,
              }
            : r,
        ),
      );

      const refreshers = Object.values(workflows || {})
        .map((workflow) => {
          if (workflow && typeof workflow.refresh === 'function') {
            try {
              return workflow.refresh();
            } catch (err) {
              console.error('Failed to refresh workflow counts', err);
              return null;
            }
          }
          return null;
        })
        .filter(Boolean);

      if (refreshers.length) {
        await Promise.allSettled(refreshers);
      }

      setIncomingReloadKey((key) => key + 1);
    } catch (err) {
      setIncomingRequests((reqs) =>
        reqs.map((r) =>
          r.request_id === id ? { ...r, error: err.message } : r,
        ),
      );
    }
  };
  if (!user?.empid) {
    return <p>Login required</p>;
  }

  return (
    <div>
      <h2>Requests</h2>
      <div
        style={{
          marginBottom: '1em',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5em',
        }}
      >
        <button
          onClick={() => setActiveTab('incoming')}
          style={{
            marginRight: '0.5em',
            fontWeight: activeTab === 'incoming' ? 'bold' : 'normal',
          }}
        >
          {`Incoming requests (${incomingCounts[status]?.count ?? 0})`}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          style={{ fontWeight: activeTab === 'outgoing' ? 'bold' : 'normal' }}
        >
          {`Outgoing requests (${outgoingCounts[status]?.count ?? 0})`}
        </button>
        {activeTab === 'incoming' && (
          <button onClick={() => setIncomingReloadKey((k) => k + 1)}>
            Refresh
          </button>
        )}
        {activeTab === 'outgoing' && (
          <button onClick={() => setOutgoingReloadKey((k) => k + 1)}>
            Refresh
          </button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (activeTab === 'incoming') {
            setIncomingReloadKey((k) => k + 1);
          } else {
            setOutgoingReloadKey((k) => k + 1);
          }
        }}
        style={{ marginBottom: '1em' }}
      >
        {activeTab === 'incoming' && (
          <label style={{ marginRight: '0.5em' }}>
            Requester:
            <select
              value={requestedEmpid}
              onChange={(e) => setRequestedEmpid(e.target.value)}
              style={{ marginLeft: '0.25em' }}
            >
              <option value="">Any</option>
              {requesterOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ marginRight: '0.5em' }}>
          Transaction Type:
          <select
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          >
            <option value="">Any</option>
            {tableOptions.map((tbl) => (
              <option key={tbl} value={tbl}>
                {tbl}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginRight: '0.5em' }}>
          Request Type:
          <select
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          >
            <option value="">Any</option>
            <option value="edit">Edit Request</option>
            <option value="delete">Delete Request</option>
            <option value="report_approval">Report Approval</option>
          </select>
        </label>
        <label style={{ marginRight: '0.5em' }}>
          Status:
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <label style={{ marginRight: '0.5em' }}>
          Date Field:
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            style={{ marginLeft: '0.25em' }}
          >
            <option value="created">Created</option>
            <option value="responded">Responded</option>
          </select>
        </label>
        <label style={{ marginRight: '0.5em' }}>
          Date:
          <DateRangePicker
            start={dateFrom}
            end={dateTo}
            onChange={handleDateRangeChange}
            style={{ marginLeft: '0.25em' }}
          />
        </label>
        <button type="submit">Apply</button>
      </form>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {requests.map((req) => {
        if (req.request_type === 'report_approval') {
          const status = req.status || req.response_status || 'pending';
          const statusLower = status ? String(status).toLowerCase() : 'pending';
          const userEmp = normalizeEmpId(user.empid);
          const requesterId = normalizeEmpId(req.emp_id);
          const isRequester = requesterId === userEmp;
          const isPending = !statusLower || statusLower === 'pending';
          const canRespond =
            activeTab === 'incoming' && !isRequester && isPending;
          const meta = req.report_metadata || req.proposed_data;
          const cardStyle = {
            border: '1px solid #ccc',
            margin: '1em 0',
            padding: '1em',
            background:
              statusLower === 'accepted'
                ? '#e6ffed'
                : statusLower === 'declined'
                ? '#ffe6e6'
                : 'transparent',
          };
          return (
            <div key={req.request_id} style={cardStyle}>
              <h4>
                Report approval — {meta?.procedure || 'Unknown procedure'}
              </h4>
              <p>
                <strong>Requested by:</strong> {req.emp_id}
              </p>
              <p>
                <strong>Status:</strong>{' '}
                {status
                  ? status.charAt(0).toUpperCase() + status.slice(1)
                  : 'Pending'}
              </p>
              <p>
                <strong>Requested:</strong> {formatDateTimeDisplay(req.created_at)}
              </p>
              {req.responded_at && (
                <p>
                  <strong>Responded:</strong>{' '}
                  {formatDateTimeDisplay(req.responded_at)}
                </p>
              )}
              {req.request_reason && (
                <p>
                  <strong>Reason:</strong> {req.request_reason}
                </p>
              )}
              {req.response_notes && (
                <p>
                  <strong>Response notes:</strong> {req.response_notes}
                </p>
              )}
              <div style={{ marginTop: '0.5rem' }}>
                <ReportApprovalDetails meta={meta} requestId={req.request_id} />
              </div>
              {activeTab === 'incoming' ? (
                canRespond ? (
                  <>
                    <textarea
                      placeholder="Response Notes"
                      value={req.notes}
                      onChange={(e) =>
                        updateNotes(req.request_id, e.target.value)
                      }
                      style={{
                        width: '100%',
                        minHeight: '4em',
                        marginTop: '0.75rem',
                      }}
                    />
                    <div style={{ marginTop: '0.5em' }}>
                      <button
                        onClick={() => respond(req.request_id, 'accepted')}
                        disabled={!req.notes?.trim()}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respond(req.request_id, 'declined')}
                        style={{ marginLeft: '0.5em' }}
                        disabled={!req.notes?.trim()}
                      >
                        Decline
                      </button>
                    </div>
                  </>
                ) : isRequester ? (
                  <p style={{ marginTop: '0.5rem' }}>Awaiting senior response…</p>
                ) : null
              ) : isRequester && statusLower === 'pending' ? (
                <p style={{ marginTop: '0.5rem' }}>Awaiting senior response…</p>
              ) : null}
              {req.error && <p style={{ color: 'red' }}>{req.error}</p>}
            </div>
          );
        }

        const columns = req.fields.map((f) => f.name);
        const fieldMap = {};
        req.fields.forEach((f) => {
          fieldMap[f.name] = f;
        });
        const columnAlign = {};
        columns.forEach((c) => {
          const sample =
            fieldMap[c].before !== undefined && fieldMap[c].before !== null
              ? fieldMap[c].before
              : fieldMap[c].after;
          columnAlign[c] = typeof sample === 'number' ? 'right' : 'left';
        });
        const userEmp = String(user.empid).trim();
        const requestStatus = req.status || req.response_status;
        const requestStatusLower = requestStatus
          ? String(requestStatus).trim().toLowerCase()
          : undefined;
        const isRequester = String(req.emp_id).trim() === userEmp;

        const seniorStr = String(req.senior_empid ?? '').trim();
        const seniorNorm = seniorStr.toLowerCase();
        const assignedSenior =
          seniorStr && !['0', 'null', 'undefined'].includes(seniorNorm)
            ? seniorStr
            : null;

        const isPending =
          !requestStatusLower || requestStatusLower === 'pending';
        const canRespond =
          !isRequester &&
          isPending &&
          (!assignedSenior || assignedSenior === userEmp);

        return (
          <div
            key={req.request_id}
            style={{
              border: '1px solid #ccc',
              margin: '1em 0',
              padding: '1em',
              background:
                requestStatus === 'accepted'
                  ? '#e6ffed'
                  : requestStatus === 'declined'
                  ? '#ffe6e6'
                  : 'transparent',
            }}
          >
            <h4>
              {req.table_name} #{req.record_id} ({req.request_type})
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse' }}
              >
                <thead>
                <tr>
                  <th
                    style={{
                      border: '1px solid #ccc',
                      padding: '0.25em',
                      whiteSpace: 'nowrap',
                      width: '1%',
                    }}
                  />
                  {columns.map((c) => (
                    <th
                      key={c}
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        textAlign: columnAlign[c],
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {headerMap[c] || translateToMn(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th
                    style={{
                      border: '1px solid #ccc',
                      padding: '0.25em',
                      whiteSpace: 'nowrap',
                      width: '1%',
                      textAlign: 'left',
                      verticalAlign: 'top',
                    }}
                  >
                    Original
                  </th>
                  {columns.map((c) => (
                    <td
                      key={c}
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        background: fieldMap[c].changed
                          ? '#ffe6e6'
                          : undefined,
                        textAlign: columnAlign[c],
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        verticalAlign: 'top',
                      }}
                    >
                      {renderValue(fieldMap[c].before)}
                    </td>
                  ))}
                </tr>
                {req.request_type !== 'delete' && (
                  <tr>
                    <th
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25em',
                        whiteSpace: 'nowrap',
                        width: '1%',
                        textAlign: 'left',
                        verticalAlign: 'top',
                      }}
                    >
                      Proposed
                    </th>
                    {columns.map((c) => (
                      <td
                        key={c}
                        style={{
                          border: '1px solid #ccc',
                          padding: '0.25em',
                          background: fieldMap[c].changed
                            ? '#e6ffe6'
                            : undefined,
                          textAlign: columnAlign[c],
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          verticalAlign: 'top',
                        }}
                      >
                        {renderValue(fieldMap[c].after)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
              </table>
            </div>
            {!isPending ? (
              <p>Request {requestStatus}</p>
            ) : canRespond ? (
              <>
                <textarea
                  placeholder="Response Notes"
                  value={req.notes}
                  onChange={(e) => updateNotes(req.request_id, e.target.value)}
                  style={{ width: '100%', minHeight: '4em' }}
                />
                <div style={{ marginTop: '0.5em' }}>
                  <button
                    onClick={() => respond(req.request_id, 'accepted')}
                    disabled={!req.notes?.trim()}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond(req.request_id, 'declined')}
                    style={{ marginLeft: '0.5em' }}
                    disabled={!req.notes?.trim()}
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : isRequester ? (
              <p>Awaiting senior response…</p>
            ) : null}
            {req.error && <p style={{ color: 'red' }}>{req.error}</p>}
          </div>
        );
      })}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginTop: '1em',
          gap: '1rem',
        }}
      >
        <div>
          Rows per page:
          <input
            type="number"
            value={perPage}
            onChange={(e) => {
              const val = Number(e.target.value) || 1;
              setIncomingPage(1);
              setOutgoingPage(1);
              setPerPage(val);
            }}
            min="1"
            style={{ marginLeft: '0.25rem', width: '4rem' }}
          />
        </div>
        <div>
          <button
            onClick={() =>
              activeTab === 'incoming'
                ? setIncomingPage(1)
                : setOutgoingPage(1)
            }
            disabled={currentPage === 1 || loading}
            style={{ marginRight: '0.25rem' }}
          >
            {'<<'}
          </button>
          <button
            onClick={() =>
              activeTab === 'incoming'
                ? setIncomingPage((p) => Math.max(1, p - 1))
                : setOutgoingPage((p) => Math.max(1, p - 1))
            }
            disabled={currentPage === 1 || loading}
            style={{ marginRight: '0.25rem' }}
          >
            {'<'}
          </button>
          <span>
            Page
            <input
              type="number"
              value={currentPage}
              onChange={(e) => {
                let val = Number(e.target.value) || 1;
                if (val < 1) val = 1;
                if (val > totalPages) val = totalPages;
                activeTab === 'incoming'
                  ? setIncomingPage(val)
                  : setOutgoingPage(val);
              }}
              style={{ width: '3rem', margin: '0 0.25rem', textAlign: 'center' }}
              min="1"
              max={totalPages}
            />
            {` of ${totalPages}`}
          </span>
          <button
            onClick={() =>
              activeTab === 'incoming'
                ? setIncomingPage((p) => Math.min(totalPages, p + 1))
                : setOutgoingPage((p) => Math.min(totalPages, p + 1))
            }
            disabled={currentPage >= totalPages || loading}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>'}
          </button>
          <button
            onClick={() =>
              activeTab === 'incoming'
                ? setIncomingPage(totalPages)
                : setOutgoingPage(totalPages)
            }
            disabled={currentPage >= totalPages || loading}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>>'}
          </button>
        </div>
      </div>
      {!loading && requests.length === 0 && <p>No pending requests.</p>}
    </div>
  );
}

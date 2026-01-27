import {
  pool,
  updateTableRow,
  deleteTableRow,
  listTableColumns,
  getTableRowById,
  getPrimaryKeyColumns,
  reassignReportTransactionLocks,
  isTransactionLocked,
} from '../../db/index.js';
import { logUserAction } from './userActivityLog.js';
import { isDeepStrictEqual } from 'util';
import crypto from 'crypto';
import { formatDateForDb } from '../utils/formatDate.js';
import {
  createReportApprovalLocks,
  finalizeReportApprovalRequest,
  releaseReportApprovalLocks,
} from './reportApprovals.js';
import { storeSnapshotArtifact } from './reportSnapshotArtifacts.js';

const SNAPSHOT_MAX_INLINE_ROWS = Number(
  process.env.REPORT_APPROVAL_MAX_INLINE_ROWS || 1000,
);
const SNAPSHOT_MAX_INLINE_BYTES = Number(
  process.env.REPORT_APPROVAL_MAX_INLINE_BYTES || 2 * 1024 * 1024,
);
const SNAPSHOT_PREVIEW_ROWS = Number(
  process.env.REPORT_APPROVAL_PREVIEW_ROWS || 200,
);

export const ALLOWED_REQUEST_TYPES = new Set([
  'edit',
  'delete',
  'report_approval',
  'bulk_edit',
]);

async function ensureValidTableName(tableName) {
  const cols = await listTableColumns(tableName);
  if (!cols.length) {
    const err = new Error('invalid table_name');
    err.status = 400;
    throw err;
  }
}

function parseProposedData(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function normalizeBulkEditPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const recordIdsRaw =
    value.recordIds || value.record_ids || value.recordIdList || value.record_id_list;
  const updatesRaw = value.updates || value.update || null;
  if (!Array.isArray(recordIdsRaw) || recordIdsRaw.length === 0) return null;
  if (!updatesRaw || typeof updatesRaw !== 'object' || Array.isArray(updatesRaw))
    return null;
  const recordIds = recordIdsRaw.map((id) => {
    if (typeof id === 'string') return id;
    if (id === undefined || id === null) return '';
    try {
      return JSON.stringify(id);
    } catch {
      return String(id);
    }
  }).filter((id) => String(id).trim().length > 0);
  if (recordIds.length === 0) return null;
  return { recordIds, updates: updatesRaw };
}

function normalizeSnapshotRow(row, columns = []) {
  if (!row) return null;
  let normalized = sanitizeRowObject(row);
  if (!normalized && Array.isArray(row)) {
    const mappingCols = columns.length ? columns : row.map((_, idx) => `column_${idx + 1}`);
    normalized = Object.fromEntries(mappingCols.map((col, idx) => [col, row[idx]]));
  }
  if (!normalized && typeof row === 'object') {
    const entries = Object.entries(row)
      .filter(([key]) => typeof key === 'string' && key.trim())
      .map(([key, value]) => [key.trim(), value]);
    if (entries.length) {
      normalized = Object.fromEntries(entries);
    }
  }
  if (normalized && Object.keys(normalized).length) {
    return normalized;
  }
  return null;
}

function sanitizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version && Number(raw.version) >= 2) {
    const cloned = { ...raw };
    const initialColumns = sanitizeColumns(
      raw.columns || raw.snapshotColumns || raw.headers || [],
    );
    let columns = [...initialColumns];
    const normalizedRows = Array.isArray(raw.rows)
      ? raw.rows
          .map((row) => normalizeSnapshotRow(row, columns))
          .filter(Boolean)
      : [];
    if (!columns.length && normalizedRows.length) {
      columns = Object.keys(normalizedRows[0]);
    }
    cloned.rows = normalizedRows;
    if (columns.length) {
      cloned.columns = columns;
    }
    cloned.fieldTypeMap =
      raw.fieldTypeMap && typeof raw.fieldTypeMap === 'object'
        ? raw.fieldTypeMap
        : {};
    if (
      cloned.totalRow &&
      Array.isArray(cloned.totalRow) &&
      cloned.columns &&
      Array.isArray(cloned.columns)
    ) {
      cloned.totalRow = Object.fromEntries(
        cloned.columns.map((col, idx) => [col, cloned.totalRow[idx]]),
      );
    }
    return cloned;
  }

  const output = { version: 2 };
  const rawColumns = sanitizeColumns(
    raw.columns || raw.snapshotColumns || raw.headers || [],
  );
  const rawRows = (() => {
    if (Array.isArray(raw.rows)) return raw.rows;
    if (Array.isArray(raw.dataRows)) return raw.dataRows;
    if (Array.isArray(raw.data)) return raw.data;
    if (Array.isArray(raw.values)) return raw.values;
    return [];
  })();

  let columns = [...rawColumns];
  const sanitizedRows = [];

  rawRows.forEach((row) => {
    const normalized = normalizeSnapshotRow(row, columns);
    if (normalized) {
      if (!columns.length) {
        columns = Object.keys(normalized);
      }
      sanitizedRows.push(normalized);
    }
  });

  if (!columns.length && sanitizedRows.length) {
    columns = Object.keys(sanitizedRows[0]);
  }

  const totalRowCandidate =
    raw.totalRow || raw.total_row || raw.total || raw.footer || raw.summaryRow || null;
  let totalRow = null;
  if (totalRowCandidate) {
    if (Array.isArray(totalRowCandidate)) {
      const mappingCols = columns.length
        ? columns
        : totalRowCandidate.map((_, idx) => `column_${idx + 1}`);
      totalRow = Object.fromEntries(
        mappingCols.map((col, idx) => [col, totalRowCandidate[idx]]),
      );
    } else if (typeof totalRowCandidate === 'object') {
      totalRow = Object.fromEntries(
        Object.entries(totalRowCandidate).filter(([key]) =>
          typeof key === 'string' && key.trim(),
        ),
      );
      if (!columns.length && totalRow && Object.keys(totalRow).length) {
        columns = Object.keys(totalRow);
      }
    }
  }

  const rowCount = (() => {
    if (typeof raw.rowCount === 'number' && Number.isFinite(raw.rowCount)) {
      return raw.rowCount;
    }
    if (typeof raw.count === 'number' && Number.isFinite(raw.count)) {
      return raw.count;
    }
    return sanitizedRows.length;
  })();

  output.columns = columns;

  if (raw.fieldTypeMap && typeof raw.fieldTypeMap === 'object') {
    output.fieldTypeMap = Object.fromEntries(
      Object.entries(raw.fieldTypeMap).filter(
        ([key, value]) => typeof key === 'string' && typeof value === 'string',
      ),
    );
  } else if (
    raw.snapshotFieldTypeMap &&
    typeof raw.snapshotFieldTypeMap === 'object'
  ) {
    output.fieldTypeMap = Object.fromEntries(
      Object.entries(raw.snapshotFieldTypeMap).filter(
        ([key, value]) => typeof key === 'string' && typeof value === 'string',
      ),
    );
  } else {
    output.fieldTypeMap = {};
  }

  let inlineRows = sanitizedRows;
  let artifactMeta = null;
  const shouldPersist = (() => {
    if (sanitizedRows.length === 0) return false;
    if (sanitizedRows.length > SNAPSHOT_MAX_INLINE_ROWS) return true;
    try {
      const size = Buffer.byteLength(JSON.stringify(sanitizedRows));
      return size > SNAPSHOT_MAX_INLINE_BYTES;
    } catch {
      return true;
    }
  })();

  if (shouldPersist) {
    inlineRows = sanitizedRows.slice(0, SNAPSHOT_PREVIEW_ROWS);
    try {
      artifactMeta = storeSnapshotArtifact({
        rows: sanitizedRows,
        columns,
        fieldTypeMap: output.fieldTypeMap,
        procedure: raw.procedure || raw.procedureName || null,
        params:
          (raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params)
            ? raw.params
            : null) ||
          (raw.parameters &&
          typeof raw.parameters === 'object' &&
          !Array.isArray(raw.parameters)
            ? raw.parameters
            : {}),
      });
    } catch (err) {
      artifactMeta = null;
    }
  }

  output.rows = inlineRows;
  output.rowCount = rowCount;
  if (artifactMeta) {
    output.artifact = {
      id: artifactMeta.id,
      fileName: artifactMeta.fileName,
      byteSize: artifactMeta.byteSize,
      rowCount: artifactMeta.rowCount,
      createdAt: artifactMeta.createdAt,
    };
    output.previewRowCount = inlineRows.length;
  }

  if (totalRow) {
    output.totalRow = totalRow;
  }

  if (raw.label && typeof raw.label === 'string' && raw.label.trim()) {
    output.label = raw.label.trim();
  }
  if (raw.summary && typeof raw.summary === 'string' && raw.summary.trim()) {
    output.summary = raw.summary.trim();
  }

  if (
    (!output.rows || output.rows.length === 0) &&
    (!output.columns || output.columns.length === 0) &&
    (!output.fieldTypeMap || Object.keys(output.fieldTypeMap).length === 0) &&
    !output.label &&
    !output.summary &&
    !output.totalRow &&
    !artifactMeta
  ) {
    return null;
  }
  return output;
}

export const __test__ = {
  sanitizeSnapshot,
};

function sanitizeColumns(columns) {
  if (!Array.isArray(columns)) return [];
  const seen = new Set();
  const normalized = [];
  columns.forEach((col) => {
    if (typeof col !== 'string') return;
    const trimmed = col.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });
  return normalized;
}

function sanitizeFieldTypeMap(map) {
  if (!map || typeof map !== 'object') return {};
  return Object.fromEntries(
    Object.entries(map)
      .filter(
        ([key, value]) =>
          typeof key === 'string' &&
          key.trim() &&
          (typeof value === 'string' || typeof value === 'number'),
      )
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function sanitizeRowObject(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const entries = Object.entries(row).filter(
    ([key]) => typeof key === 'string' && key.trim(),
  );
  if (!entries.length) return null;
  return Object.fromEntries(entries);
}

function extractSnapshotFromContainer(container) {
  if (!container || typeof container !== 'object') {
    return { snapshot: null, columns: [], fieldTypeMap: {} };
  }

  if (Array.isArray(container.rows)) {
    const firstRow = container.rows.find(
      (row) => row && typeof row === 'object' && !Array.isArray(row),
    );
    const sanitizedRow = sanitizeRowObject(firstRow);
    if (sanitizedRow) {
      const columns = sanitizeColumns(container.columns || []);
      const fieldTypeMap = sanitizeFieldTypeMap(
        container.fieldTypeMap || container.snapshotFieldTypeMap || {},
      );
      return {
        snapshot: sanitizedRow,
        columns: columns.length ? columns : Object.keys(sanitizedRow),
        fieldTypeMap,
      };
    }
  }

  const nestedKeys = [
    'row',
    'record',
    'snapshotRow',
    'snapshot_row',
    'current',
    'previous',
    'data',
    'values',
  ];
  for (const key of nestedKeys) {
    if (!container[key]) continue;
    const sanitizedRow = sanitizeRowObject(container[key]);
    if (sanitizedRow) {
      return {
        snapshot: sanitizedRow,
        columns: Object.keys(sanitizedRow),
        fieldTypeMap: sanitizeFieldTypeMap(
          container.fieldTypeMap || container.snapshotFieldTypeMap || {},
        ),
      };
    }
  }

  const direct = sanitizeRowObject(container);
  if (direct) {
    return {
      snapshot: direct,
      columns: Object.keys(direct),
      fieldTypeMap: sanitizeFieldTypeMap(
        container.fieldTypeMap || container.snapshotFieldTypeMap || {},
      ),
    };
  }

  return { snapshot: null, columns: [], fieldTypeMap: {} };
}

function sanitizeTransactionSnapshot(tx) {
  if (!tx || typeof tx !== 'object') {
    return { snapshot: null, columns: [], fieldTypeMap: {} };
  }

  const sources = [
    tx.snapshot,
    tx.lockSnapshot,
    tx.lock_snapshot,
    tx.snapshotData,
    tx.snapshot_data,
    tx.record,
    tx.row,
    tx.current,
    tx.previous,
    tx.data,
    tx.values,
  ];

  for (const candidate of sources) {
    if (!candidate) continue;
    const { snapshot, columns, fieldTypeMap } =
      extractSnapshotFromContainer(candidate);
    if (snapshot) {
      return { snapshot, columns, fieldTypeMap };
    }
  }

  return { snapshot: null, columns: [], fieldTypeMap: {} };
}

function pickFirstString(values = []) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return '';
}

function sanitizeReportApprovalTransaction(tx) {
  if (!tx || typeof tx !== 'object') return null;
  const tableCandidate =
    tx.table ||
    tx.tableName ||
    tx.table_name ||
    tx.lockTable ||
    tx.lock_table ||
    tx.lock_table_name;
  const recordCandidate =
    tx.recordId ??
    tx.record_id ??
    tx.id ??
    tx.transactionId ??
    tx.transaction_id ??
    tx.lock_record_id ??
    tx.lockRecordId;
  if (!tableCandidate || !/^[a-zA-Z0-9_]+$/.test(String(tableCandidate))) {
    return null;
  }
  if (recordCandidate === undefined || recordCandidate === null || recordCandidate === '') {
    return null;
  }
  const tableName = String(tableCandidate).trim();
  const recordId = String(recordCandidate);

  let snapshotColumns = sanitizeColumns(tx.snapshotColumns || tx.columns || []);
  let fieldTypeMap = sanitizeFieldTypeMap(
    tx.snapshotFieldTypeMap || tx.fieldTypeMap || {},
  );
  const { snapshot, columns: derivedColumns, fieldTypeMap: derivedFieldTypes } =
    sanitizeTransactionSnapshot(tx);
  if (snapshot) {
    if (!snapshotColumns.length && derivedColumns.length) {
      snapshotColumns = derivedColumns;
    }
    if (!Object.keys(fieldTypeMap).length && Object.keys(derivedFieldTypes).length) {
      fieldTypeMap = derivedFieldTypes;
    }
  }

  const label = pickFirstString([
    tx.label,
    tx.description,
    tx.note,
    tx.title,
    tx.message,
  ]);
  const reason = pickFirstString([
    tx.reason,
    tx.justification,
    tx.explanation,
    tx.exclude_reason,
    tx.lock_reason,
    tx.lockReason,
  ]);
  const lockStatus = pickFirstString([tx.lockStatus, tx.status]);
  const lockedBy = pickFirstString([
    tx.lockedBy,
    tx.locked_by,
    tx.assignedTo,
    tx.assigned_to,
  ]);
  const lockedAt = pickFirstString([tx.lockedAt, tx.locked_at]);
  const locked = Boolean(
    tx.locked ?? tx.is_locked ?? tx.isLocked ?? tx.lock_flag ?? tx.lockFlag,
  );

  const sanitized = {
    table: tableName,
    tableName,
    recordId,
    record_id: recordId,
  };

  if (label) sanitized.label = label;
  if (reason) sanitized.reason = reason;
  if (lockStatus) {
    sanitized.lockStatus = lockStatus;
    sanitized.status = lockStatus;
  }
  if (lockedBy) {
    sanitized.lockedBy = lockedBy;
    sanitized.locked_by = lockedBy;
  }
  if (lockedAt) {
    sanitized.lockedAt = lockedAt;
    sanitized.locked_at = lockedAt;
  }
  if (locked) sanitized.locked = true;
  if (snapshot) sanitized.snapshot = snapshot;
  if (snapshotColumns.length) {
    sanitized.snapshotColumns = snapshotColumns;
    sanitized.columns = snapshotColumns;
  }
  if (Object.keys(fieldTypeMap).length) {
    sanitized.snapshotFieldTypeMap = fieldTypeMap;
    sanitized.fieldTypeMap = fieldTypeMap;
  }

  return sanitized;
}

function normalizeReportApprovalPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const procedure = raw.procedure || raw.procedureName;
  if (!procedure || typeof procedure !== 'string' || !procedure.trim()) {
    return null;
  }
  const parameters =
    raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters)
      ? raw.parameters
      : {};
  const txCandidates = Array.isArray(raw.transactions) ? raw.transactions : [];
  const seen = new Set();
  const transactions = txCandidates
    .map((tx) => {
      const sanitized = sanitizeReportApprovalTransaction(tx);
      if (!sanitized) return null;
      const key = `${sanitized.table}::${sanitized.recordId}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return sanitized;
    })
    .filter(Boolean);
  if (!transactions.length) {
    return null;
  }
  const snapshot = sanitizeSnapshot(raw.snapshot || raw.reportSnapshot);
  let executedAt = null;
  const executedAtValue =
    raw.executed_at || raw.executedAt || raw.run_at || raw.runAt || null;
  if (executedAtValue) {
    const date = new Date(executedAtValue);
    if (!Number.isNaN(date.getTime())) executedAt = date.toISOString();
  }
  const normalized = { ...(raw || {}) };
  const lockRequestId =
    raw.lockRequestId ?? raw.lock_request_id ?? raw.requestId ?? raw.request_id;
  if (
    lockRequestId !== undefined &&
    lockRequestId !== null &&
    String(lockRequestId).trim()
  ) {
    normalized.lockRequestId = lockRequestId;
  }
  normalized.procedure = procedure.trim();
  normalized.parameters = parameters;
  normalized.transactions = transactions;
  if (snapshot) normalized.snapshot = snapshot;
  normalized.executed_at = executedAt;
  return normalized;
}

function normalizeSupervisorEmpId(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function normalizeLockRequestId(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeStatuses(status) {
  if (status === undefined || status === null) return [];
  const rawList = Array.isArray(status) ? status : String(status).split(',');
  const normalized = rawList
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  if (!normalized.length) return [];
  if (normalized.includes('any') || normalized.includes('all')) return [];
  return Array.from(new Set(normalized));
}

export async function createRequest({
  tableName,
  recordId,
  empId,
  requestType,
  proposedData,
  requestReason,
  companyId = 0,
}) {
  await ensureValidTableName(tableName);
  if (!ALLOWED_REQUEST_TYPES.has(requestType)) {
    throw new Error('Invalid request type');
  }
  if (!requestReason || !String(requestReason).trim()) {
    const err = new Error('request_reason required');
    err.status = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await conn.query('BEGIN');
    const [rows] = await conn.query(
      `SELECT employment_senior_empid, employment_senior_plan_empid
         FROM tbl_employment
        WHERE employment_emp_id = ?
        LIMIT 1`,
      [empId],
    );
    const seniorPlan = normalizeSupervisorEmpId(
      rows[0]?.employment_senior_plan_empid,
    );
    const seniorLegacy = normalizeSupervisorEmpId(
      rows[0]?.employment_senior_empid,
    );
    const senior =
      requestType === 'report_approval'
        ? seniorPlan || seniorLegacy
        : seniorLegacy;
    const parsedInput = parseProposedData(proposedData);
    let finalProposed = parsedInput ?? proposedData;
    let originalData = null;
    if (requestType === 'report_approval') {
      const normalizedPayload = normalizeReportApprovalPayload(
        parsedInput ?? proposedData,
      );
      if (!normalizedPayload) {
        const err = new Error('invalid_report_payload');
        err.status = 400;
        throw err;
      }
      finalProposed = normalizedPayload;
    } else if (requestType === 'edit') {
      const pkCols = await getPrimaryKeyColumns(tableName);
      let currentRow = null;
      if (pkCols.length === 1) {
        const col = pkCols[0];
        const where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
        const [r] = await conn.query(
          `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
          [tableName, recordId],
        );
        currentRow = r[0] || null;
      } else if (pkCols.length > 1) {
        const parts = String(recordId).split('-');
        const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
        const [r] = await conn.query(
          `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
          [tableName, ...parts],
        );
        currentRow = r[0] || null;
      }
      originalData = currentRow;
    } else if (requestType === 'delete') {
      const pkCols = await getPrimaryKeyColumns(tableName);
      let currentRow = null;
      if (pkCols.length === 1) {
        const col = pkCols[0];
        const where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
        const [r] = await conn.query(
          `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
          [tableName, recordId],
        );
        currentRow = r[0] || null;
      } else if (pkCols.length > 1) {
        const parts = String(recordId).split('-');
        const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
        const [r] = await conn.query(
          `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
          [tableName, ...parts],
        );
        currentRow = r[0] || null;
      }
      finalProposed = currentRow;
    }
    const normalizedEmp = String(empId).trim().toUpperCase();
    const [existing] = await conn.query(
      `SELECT request_id, proposed_data FROM pending_request
       WHERE company_id = ? AND table_name = ? AND record_id = ? AND emp_id = ?
         AND request_type = ? AND status = 'pending'
       LIMIT 1`,
      [companyId, tableName, recordId, normalizedEmp, requestType],
    );
    if (existing.length) {
      const existingData = parseProposedData(existing[0].proposed_data);
      if (isDeepStrictEqual(existingData, finalProposed || null)) {
        const err = new Error('Duplicate pending request');
        err.status = 409;
        throw err;
      }
    }
    const lockRequestId =
      requestType === 'report_approval'
        ? normalizeLockRequestId(
            finalProposed?.lockRequestId ?? finalProposed?.lock_request_id,
          )
        : null;
    const [result] = await conn.query(
      `INSERT INTO pending_request (company_id, table_name, record_id, emp_id, senior_empid, request_type, request_reason, proposed_data, original_data, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        tableName,
        recordId,
        normalizedEmp,
        senior,
        requestType,
        requestReason,
        finalProposed ? JSON.stringify(finalProposed) : null,
        originalData ? JSON.stringify(originalData) : null,
        normalizedEmp,
      ],
    );
    const requestId = result.insertId;
    const requestAction =
      requestType === 'edit'
        ? 'request_edit'
        : requestType === 'delete'
        ? 'request_delete'
        : requestType === 'bulk_edit'
        ? 'request_bulk_edit'
        : 'request_report_approval';
    await logUserAction(
      {
        emp_id: empId,
        table_name: tableName,
        record_id: recordId,
        action: requestAction,
        details: finalProposed || null,
        request_id: requestId,
        company_id: companyId,
      },
      conn,
    );
    if (requestType === 'report_approval') {
      let reassigned = false;
      if (lockRequestId) {
        const updated = await reassignReportTransactionLocks(
          {
            fromRequestId: lockRequestId,
            toRequestId: requestId,
            companyId,
          },
          conn,
        );
        reassigned = updated > 0;
      }
      if (!reassigned) {
        await createReportApprovalLocks(
          {
            companyId,
            requestId,
            transactions: finalProposed.transactions,
            createdBy: normalizedEmp,
          },
          conn,
        );
      }
    }
    if (senior) {
      await conn.query(
        `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
         VALUES (?, ?, 'request', ?, ?, ?)`,
        [
          companyId,
          senior,
          requestId,
          `Pending ${requestType} request for ${tableName}#${recordId}`,
          normalizedEmp,
        ],
      );
    }
    await conn.query('COMMIT');
    return {
      request_id: requestId,
      senior_empid: senior,
      senior_plan_empid: seniorPlan,
    };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

export async function createBulkEditRequest({
  tableName,
  recordIds = [],
  empId,
  field,
  value,
  requestReason,
  companyId = 0,
  reportPayload = null,
}) {
  await ensureValidTableName(tableName);
  if (!requestReason || !String(requestReason).trim()) {
    const err = new Error('request_reason required');
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    const err = new Error('record_ids required');
    err.status = 400;
    throw err;
  }
  const columns = await listTableColumns(tableName);
  const columnLookup = new Map(
    columns.map((col) => [String(col).toLowerCase(), col]),
  );
  const resolvedField = columnLookup.get(String(field).toLowerCase());
  if (!resolvedField) {
    const err = new Error('invalid field');
    err.status = 400;
    throw err;
  }
  const normalizedRecordIds = Array.from(
    new Set(
      recordIds
        .map((id) => {
          if (typeof id === 'string') return id.trim();
          if (id === undefined || id === null) return '';
          try {
            return JSON.stringify(id);
          } catch {
            return String(id);
          }
        })
        .filter((id) => id),
    ),
  );
  if (normalizedRecordIds.length === 0) {
    const err = new Error('record_ids required');
    err.status = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await conn.query('BEGIN');
    if (tableName && tableName.startsWith('transactions_')) {
      for (const recordId of normalizedRecordIds) {
        const locked = await isTransactionLocked(
          { tableName, recordId, companyId },
          conn,
        );
        if (locked) {
          const err = new Error('Transaction locked for report approval');
          err.status = 423;
          throw err;
        }
      }
    }
    const normalizedEmp = String(empId).trim().toUpperCase();
    const [supervisorRows] = await conn.query(
      `SELECT 1
         FROM tbl_employment
        WHERE UPPER(TRIM(employment_senior_empid)) = ?
           OR UPPER(TRIM(employment_senior_plan_empid)) = ?
        LIMIT 1`,
      [normalizedEmp, normalizedEmp],
    );
    if (!supervisorRows.length) {
      const err = new Error('supervisor required');
      err.status = 400;
      throw err;
    }
    const senior = normalizedEmp;
    const payload = {
      recordIds: normalizedRecordIds,
      updates: { [resolvedField]: value },
      ...(reportPayload ? { report_payload: reportPayload } : {}),
    };
    const recordIdSignature = JSON.stringify({
      ids: normalizedRecordIds,
      field: resolvedField,
      value,
    });
    const recordId = `bulk:${crypto
      .createHash('sha256')
      .update(recordIdSignature)
      .digest('hex')
      .slice(0, 32)}`;
    const [existing] = await conn.query(
      `SELECT request_id, proposed_data FROM pending_request
       WHERE company_id = ? AND table_name = ? AND record_id = ? AND emp_id = ?
         AND request_type = 'bulk_edit' AND status = 'pending'
       LIMIT 1`,
      [companyId, tableName, recordId, normalizedEmp],
    );
    if (existing.length) {
      const existingData = parseProposedData(existing[0].proposed_data);
      if (isDeepStrictEqual(existingData, payload)) {
        const err = new Error('Duplicate pending request');
        err.status = 409;
        throw err;
      }
    }
    const originalData = [];
    for (const recordId of normalizedRecordIds) {
      try {
        const row = await getTableRowById(tableName, recordId, {
          defaultCompanyId: companyId,
        });
        if (row) {
          originalData.push({ recordId, row });
        }
      } catch {
        // ignore missing rows; handled by approver on submit
      }
    }
    const [result] = await conn.query(
      `INSERT INTO pending_request (company_id, table_name, record_id, emp_id, senior_empid, request_type, request_reason, proposed_data, original_data, created_by)
       VALUES (?, ?, ?, ?, ?, 'bulk_edit', ?, ?, ?, ?)`,
      [
        companyId,
        tableName,
        recordId,
        normalizedEmp,
        senior,
        requestReason,
        JSON.stringify(payload),
        originalData.length ? JSON.stringify(originalData) : null,
        normalizedEmp,
      ],
    );
    const requestId = result.insertId;
    await logUserAction(
      {
        emp_id: empId,
        table_name: tableName,
        record_id: recordId,
        action: 'request_bulk_edit',
        details: payload,
        request_id: requestId,
        company_id: companyId,
      },
      conn,
    );
    if (senior) {
      await conn.query(
        `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
         VALUES (?, ?, 'request', ?, ?, ?)`,
        [
          companyId,
          senior,
          requestId,
          `Pending bulk edit request for ${tableName}`,
          normalizedEmp,
        ],
      );
    }
    await conn.query('COMMIT');
    return {
      request_id: requestId,
      record_id: recordId,
      senior_empid: senior,
    };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

export async function listRequests(filters) {
  const {
    status,
    senior_empid,
    requested_empid,
    table_name,
    request_type,
    date_from,
    date_to,
    date_field = 'created',
    page = 1,
    per_page = 2,
    count_only = false,
  } = filters || {};

  const countOnly =
    typeof count_only === 'string'
      ? ['1', 'true', 'yes'].includes(count_only.trim().toLowerCase())
      : Boolean(count_only);

  const conditions = [];
  const params = [];

  const statusList = normalizeStatuses(status);
  if (statusList.length === 1) {
    conditions.push('LOWER(TRIM(status)) = ?');
    params.push(statusList[0]);
  } else if (statusList.length > 1) {
    conditions.push(`LOWER(TRIM(status)) IN (${statusList.map(() => '?').join(', ')})`);
    params.push(...statusList);
  }
  if (senior_empid) {
    conditions.push('UPPER(TRIM(senior_empid)) = ?');
    params.push(String(senior_empid).trim().toUpperCase());
  }
  if (requested_empid) {
    conditions.push('UPPER(TRIM(emp_id)) = ?');
    params.push(String(requested_empid).trim().toUpperCase());
  }
  if (table_name) {
    conditions.push('table_name = ?');
    params.push(table_name);
  }
  if (request_type) {
    conditions.push('request_type = ?');
    params.push(request_type);
  }
  const dateColumn =
    date_field === 'responded' ? 'responded_at' : 'created_at';
  if (date_from || date_to) {
    if (date_from && date_to) {
      conditions.push(`DATE(${dateColumn}) BETWEEN ? AND ?`);
      params.push(date_from, date_to);
    } else {
      if (date_from) {
        conditions.push(`${dateColumn} >= ?`);
        params.push(date_from);
      }
      if (date_to) {
        conditions.push(`${dateColumn} < DATE_ADD(?, INTERVAL 1 DAY)`);
        params.push(date_to);
      }
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(
    `SELECT COUNT(*) as count FROM pending_request ${where}`,
    params,
  );
  const total = countRows[0]?.count || 0;

  if (countOnly) {
    return { rows: [], total };
  }

  const limit = Number(per_page) > 0 ? Number(per_page) : 2;
  const offset = (Number(page) > 0 ? Number(page) - 1 : 0) * limit;

  const [orderedIds] = await pool.query(
    `SELECT request_id,
            ${dateColumn} AS sort_value
       FROM pending_request
       ${where}
      ORDER BY ${dateColumn} DESC, request_id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  if (!orderedIds.length) {
    return { rows: [], total };
  }

  const idOrder = orderedIds
    .map((row) => row.request_id)
    .filter((id) => id !== null && id !== undefined);

  if (!idOrder.length) {
    return { rows: [], total };
  }

  const placeholders = idOrder.map(() => '?').join(', ');
  const [rowsRaw] = await pool.query(
    `SELECT pr.*, DATE_FORMAT(pr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_fmt, DATE_FORMAT(pr.responded_at, '%Y-%m-%d %H:%i:%s') AS responded_at_fmt
       FROM pending_request pr
      WHERE pr.request_id IN (${placeholders})`,
    idOrder,
  );

  const rowsById = new Map(rowsRaw.map((row) => [row.request_id, row]));
  const rows = idOrder
    .map((id) => rowsById.get(id))
    .filter((row) => row);

  const approvalRequestIds = rows
    .filter((row) => row.request_type === 'report_approval')
    .map((row) => row.request_id)
    .filter((id) => id !== null && id !== undefined);
  const approvalMap = new Map();
  if (approvalRequestIds.length) {
    const placeholders = approvalRequestIds.map(() => '?').join(', ');
    const [approvalRows] = await pool.query(
      `SELECT request_id,
              approved_by,
              snapshot_file_name,
              snapshot_file_mime,
              snapshot_file_size,
              snapshot_archived_at,
              snapshot_file_path
         FROM report_approvals
        WHERE request_id IN (${placeholders})`,
      approvalRequestIds,
    );
    approvalRows.forEach((row) => {
      approvalMap.set(row.request_id, row);
    });
  }

  const result = await Promise.all(
    rows.map(async (row) => {
      const parsed = parseProposedData(row.proposed_data);
      let original = parseProposedData(row.original_data);
      if (row.request_type === 'report_approval') {
        original = null;
      } else if (!original) {
        try {
          const pkCols = await getPrimaryKeyColumns(row.table_name);
          if (pkCols.length === 1) {
            const col = pkCols[0];
            const whereClause = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
            const [r] = await pool.query(
              `SELECT * FROM ?? WHERE ${whereClause} LIMIT 1`,
              [row.table_name, row.record_id],
            );
            original = r[0] || null;
          } else if (pkCols.length > 1) {
            const parts = String(row.record_id).split('-');
            const whereClause = pkCols
              .map((c) => `\`${c}\` = ?`)
              .join(' AND ');
            const [r] = await pool.query(
              `SELECT * FROM ?? WHERE ${whereClause} LIMIT 1`,
              [row.table_name, ...parts],
            );
            original = r[0] || null;
          }
        } catch {
          original = null;
        }
      }

      const normalizedReport =
        row.request_type === 'report_approval' && parsed
          ? normalizeReportApprovalPayload(parsed)
          : null;

      const approvalRecord =
        normalizedReport && approvalMap.size
          ? approvalMap.get(row.request_id)
          : null;

      const { created_at_fmt, responded_at_fmt, ...rest } = row;
      return {
        ...rest,
        created_at: created_at_fmt || null,
        responded_at: responded_at_fmt || null,
        proposed_data: parsed,
        original,
        report_metadata: normalizedReport
          ? {
              procedure: normalizedReport.procedure,
              parameters: normalizedReport.parameters,
              transactions: normalizedReport.transactions,
              snapshot: normalizedReport.snapshot || null,
              executed_at: normalizedReport.executed_at || null,
              requester_empid: rest.emp_id ?? null,
              approver_empid: rest.senior_empid ?? null,
              response_empid: rest.response_empid ?? null,
              archive:
                approvalRecord && approvalRecord.snapshot_file_path
                  ? {
                      fileName: approvalRecord.snapshot_file_name || null,
                      mimeType:
                        approvalRecord.snapshot_file_mime || 'application/json',
                      byteSize:
                        approvalRecord.snapshot_file_size === null ||
                        approvalRecord.snapshot_file_size === undefined
                          ? null
                          : Number(approvalRecord.snapshot_file_size),
                      archivedAt: approvalRecord.snapshot_archived_at
                        ? new Date(approvalRecord.snapshot_archived_at).toISOString()
                        : null,
                      requestId: row.request_id,
                    }
                  : null,
            }
          : null,
      };
    }),
  );

  return { rows: result, total };
}

export async function listRequestsByEmp(
  emp_id,
  {
    status,
    table_name,
    request_type,
    date_from,
    date_to,
    date_field,
    page,
    per_page,
    count_only,
  } = {},
) {
  return listRequests({
    requested_empid: emp_id,
    status,
    table_name,
    request_type,
    date_from,
    date_to,
    date_field,
    page,
    per_page,
    count_only,
  });
}

export async function respondRequest(
  id,
  responseEmpid,
  status,
  notes,
) {
  if (!notes || !String(notes).trim()) {
    const err = new Error('response_notes required');
    err.status = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await conn.query('BEGIN');
    const [rows] = await conn.query(
      'SELECT * FROM pending_request WHERE request_id = ?',
      [id],
    );
    const req = rows[0];
    if (!req) throw new Error('Request not found');
    const responder = String(responseEmpid).trim().toUpperCase();
    let senior = normalizeSupervisorEmpId(req.senior_empid);
    if (req.request_type === 'report_approval') {
      const [seniorRows] = await conn.query(
        `SELECT employment_senior_plan_empid, employment_senior_empid
           FROM tbl_employment
          WHERE employment_emp_id = ?
          LIMIT 1`,
        [req.emp_id],
      );
      const dbPlan = normalizeSupervisorEmpId(
        seniorRows[0]?.employment_senior_plan_empid,
      );
      const dbLegacy = normalizeSupervisorEmpId(
        seniorRows[0]?.employment_senior_empid,
      );
      senior = dbPlan || senior || dbLegacy;
    }
    const requester = String(req.emp_id).trim().toUpperCase();
    if (responder !== requester && responder !== senior)
      throw new Error('Forbidden');

    const proposedData = parseProposedData(req.proposed_data);
    const requestType = req.request_type;
    let lockedTransactions = [];
    let notificationMessage = 'Request approved';
    let approvalLogAction = 'approve';
    let approvalLogDetails = { proposed_data: proposedData, notes };
    const lockImpacts = [];
    const trackLockImpacts = async (impacts) => {
      if (!Array.isArray(impacts) || impacts.length === 0) return;
      impacts.forEach((impact) => {
        if (!impact) return;
        lockImpacts.push({ ...impact });
      });
    };

    if (status === 'accepted') {
      const data = proposedData;
      if (requestType === 'edit' && data) {
        const columns = await listTableColumns(req.table_name);
        if (columns.includes('updated_by')) data.updated_by = responseEmpid;
        if (columns.includes('updated_at'))
          data.updated_at = formatDateForDb(new Date());
        await updateTableRow(
          req.table_name,
          req.record_id,
          data,
          req.company_id,
          conn,
          {
            ignoreTransactionLock: true,
            mutationContext: {
              changedBy: responder,
              companyId: req.company_id,
            },
            onLockInvalidation: trackLockImpacts,
          },
        );
        await logUserAction(
          {
            emp_id: responseEmpid,
            table_name: req.table_name,
            record_id: req.record_id,
            action: 'update',
            details:
              lockImpacts.length > 0
                ? { ...data, report_lock_impacts: lockImpacts }
                : data,
            request_id: id,
            company_id: req.company_id,
          },
          conn,
        );
      } else if (requestType === 'bulk_edit') {
        const normalizedBulk = normalizeBulkEditPayload(proposedData);
        if (!normalizedBulk) {
          const err = new Error('invalid_bulk_payload');
          err.status = 400;
          throw err;
        }
        const columns = await listTableColumns(req.table_name);
        const updates = { ...normalizedBulk.updates };
        if (columns.includes('updated_by')) updates.updated_by = responseEmpid;
        if (columns.includes('updated_at'))
          updates.updated_at = formatDateForDb(new Date());
        for (const recordId of normalizedBulk.recordIds) {
          const before = await getTableRowById(req.table_name, recordId, {
            defaultCompanyId: req.company_id,
          });
          if (!before) {
            const err = new Error('Record not found for bulk update');
            err.status = 404;
            throw err;
          }
          await updateTableRow(
            req.table_name,
            recordId,
            updates,
            req.company_id,
            conn,
            {
              ignoreTransactionLock: true,
              mutationContext: {
                changedBy: responder,
                companyId: req.company_id,
              },
              onLockInvalidation: trackLockImpacts,
            },
          );
          await logUserAction(
            {
              emp_id: responseEmpid,
              table_name: req.table_name,
              record_id: recordId,
              action: 'update',
              details: {
                before,
                after: { ...before, ...updates },
                bulk_request_id: id,
              },
              request_id: id,
              company_id: req.company_id,
            },
            conn,
          );
        }
        approvalLogAction = 'approve_bulk_edit';
        approvalLogDetails = { proposed_data: normalizedBulk, notes };
        notificationMessage = 'Bulk update approved';
      } else if (requestType === 'delete') {
        await deleteTableRow(
          req.table_name,
          req.record_id,
          req.company_id,
          conn,
          responder,
          {
            ignoreTransactionLock: true,
            mutationContext: {
              changedBy: responder,
              companyId: req.company_id,
            },
            onLockInvalidation: trackLockImpacts,
          },
        );
        await logUserAction(
          {
            emp_id: responseEmpid,
            table_name: req.table_name,
            record_id: req.record_id,
            action: 'delete',
            details:
              lockImpacts.length > 0
                ? { report_lock_impacts: lockImpacts }
                : null,
            request_id: id,
            company_id: req.company_id,
          },
          conn,
        );
      } else if (requestType === 'report_approval') {
        const normalizedReport = normalizeReportApprovalPayload(proposedData);
        if (!normalizedReport) {
          const err = new Error('invalid_report_payload');
          err.status = 400;
          throw err;
        }
        lockedTransactions = await finalizeReportApprovalRequest(
          {
            companyId: req.company_id,
            requestId: req.request_id,
            procedure: normalizedReport.procedure,
            parameters: normalizedReport.parameters,
            approvedBy: responseEmpid,
            transactions: normalizedReport.transactions,
            snapshot: normalizedReport.snapshot,
          },
          conn,
        );
        approvalLogAction = 'approve_report';
        approvalLogDetails = { proposed_data: normalizedReport, notes };
        notificationMessage = 'Report approval granted';
      }
      if (lockImpacts.length > 0) {
        approvalLogDetails = {
          ...approvalLogDetails,
          report_lock_impacts: lockImpacts,
        };
      }
      await conn.query(
        `UPDATE pending_request SET status = 'accepted', responded_at = NOW(), response_empid = ?, response_notes = ?, updated_by = ?, updated_at = NOW() WHERE request_id = ?`,
        [responseEmpid, notes, responseEmpid, id],
      );
      await logUserAction(
        {
          emp_id: responseEmpid,
          table_name: req.table_name,
          record_id: req.record_id,
          action: approvalLogAction,
          details: approvalLogDetails,
          request_id: id,
          company_id: req.company_id,
        },
        conn,
      );
      await conn.query(
        `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
         VALUES (?, ?, 'response', ?, ?, ?)`,
        [
          req.company_id,
          req.emp_id,
          id,
          notificationMessage,
          responseEmpid,
        ],
      );
    } else {
      let declineLogAction = 'decline';
      let declineDetails = { proposed_data: proposedData, notes };
      if (requestType === 'report_approval') {
        await releaseReportApprovalLocks({ requestId: req.request_id }, conn);
        const normalizedReport = normalizeReportApprovalPayload(proposedData);
        if (normalizedReport) {
          declineDetails = { proposed_data: normalizedReport, notes };
        }
        declineLogAction = 'decline_report';
        notificationMessage = 'Report approval declined';
      } else if (requestType === 'bulk_edit') {
        const normalizedBulk = normalizeBulkEditPayload(proposedData);
        if (normalizedBulk) {
          declineDetails = { proposed_data: normalizedBulk, notes };
        }
        declineLogAction = 'decline_bulk_edit';
        notificationMessage = 'Bulk update declined';
      } else {
        notificationMessage = 'Request declined';
      }
      await conn.query(
        `UPDATE pending_request SET status = 'declined', responded_at = NOW(), response_empid = ?, response_notes = ?, updated_by = ?, updated_at = NOW() WHERE request_id = ?`,
        [responseEmpid, notes, responseEmpid, id],
      );
      await logUserAction(
        {
          emp_id: responseEmpid,
          table_name: req.table_name,
          record_id: req.record_id,
          action: declineLogAction,
          details: declineDetails,
          request_id: id,
          company_id: req.company_id,
        },
        conn,
      );
      await conn.query(
        `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
         VALUES (?, ?, 'response', ?, ?, ?)`,
        [
          req.company_id,
          req.emp_id,
          id,
          notificationMessage,
          responseEmpid,
        ],
      );
    }
    await conn.query('COMMIT');
    return {
      requester,
      status,
      requestType,
      lockedTransactions,
    };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

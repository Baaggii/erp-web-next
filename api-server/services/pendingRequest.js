import {
  pool,
  updateTableRow,
  deleteTableRow,
  listTableColumns,
  getPrimaryKeyColumns,
} from '../../db/index.js';
import { logUserAction } from './userActivityLog.js';
import { isDeepStrictEqual } from 'util';
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

function sanitizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version && Number(raw.version) >= 2) {
    const cloned = { ...raw };
    cloned.rows = Array.isArray(raw.rows) ? raw.rows : [];
    cloned.fieldTypeMap =
      raw.fieldTypeMap && typeof raw.fieldTypeMap === 'object'
        ? raw.fieldTypeMap
        : {};
    return cloned;
  }
  const output = { version: 2 };
  const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
  const sanitizedRows = rawRows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const entries = Object.entries(row).filter(([key]) =>
        typeof key === 'string' && key.trim(),
      );
      return Object.fromEntries(entries);
    })
    .filter((row) => row && Object.keys(row).length > 0);

  const rowCount = (() => {
    if (typeof raw.rowCount === 'number' && Number.isFinite(raw.rowCount)) {
      return raw.rowCount;
    }
    return sanitizedRows.length;
  })();

  const columns = Array.isArray(raw.columns)
    ? raw.columns.filter((c) => typeof c === 'string' && c.trim())
    : sanitizedRows.length > 0
    ? Object.keys(sanitizedRows[0])
    : [];
  output.columns = columns;

  if (raw.fieldTypeMap && typeof raw.fieldTypeMap === 'object') {
    output.fieldTypeMap = Object.fromEntries(
      Object.entries(raw.fieldTypeMap).filter(
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

  if (raw.label && typeof raw.label === 'string' && raw.label.trim()) {
    output.label = raw.label.trim();
  }
  if (raw.summary && typeof raw.summary === 'string' && raw.summary.trim()) {
    output.summary = raw.summary.trim();
  }
  if (raw.totalRow && typeof raw.totalRow === 'object' && !Array.isArray(raw.totalRow)) {
    output.totalRow = Object.fromEntries(
      Object.entries(raw.totalRow).filter(([key]) =>
        typeof key === 'string' && key.trim(),
      ),
    );
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
      if (!tx || typeof tx !== 'object') return null;
      const table = tx.table || tx.tableName;
      const recordId =
        tx.recordId ?? tx.record_id ?? tx.id ?? tx.transactionId;
      if (!table || !/^[a-zA-Z0-9_]+$/.test(String(table))) return null;
      if (recordId === undefined || recordId === null || recordId === '') return null;
      const tableName = String(table);
      const rid = String(recordId);
      const key = `${tableName}::${rid}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { table: tableName, recordId: rid };
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
      const normalizedPayload = normalizeReportApprovalPayload(parsedInput ?? proposedData);
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

function normalizeDateInput(value, type = 'start') {
  if (!value) return null;
  let trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return type === 'start' ? `${trimmed} 00:00:00` : trimmed;
  }
  if (trimmed.includes('T')) {
    trimmed = trimmed.replace('T', ' ').replace(/Z$/, '');
  }
  return trimmed;
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

  if (status) {
    conditions.push('LOWER(TRIM(status)) = ?');
    params.push(String(status).trim().toLowerCase());
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
    const normalizedFrom = normalizeDateInput(date_from, 'start');
    const normalizedTo = normalizeDateInput(date_to, 'end');
    if (date_from && date_to && normalizedFrom && normalizedTo) {
      conditions.push(`${dateColumn} >= ?`);
      params.push(normalizedFrom);
      conditions.push(`${dateColumn} < DATE_ADD(?, INTERVAL 1 DAY)`);
      params.push(normalizedTo);
    } else {
      if (normalizedFrom) {
        conditions.push(`${dateColumn} >= ?`);
        params.push(normalizedFrom);
      }
      if (normalizedTo) {
        conditions.push(`${dateColumn} < DATE_ADD(?, INTERVAL 1 DAY)`);
        params.push(normalizedTo);
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

  const [rows] = await pool.query(
    `SELECT *, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_fmt, DATE_FORMAT(responded_at, '%Y-%m-%d %H:%i:%s') AS responded_at_fmt FROM pending_request ${where} ORDER BY ${dateColumn} DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

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

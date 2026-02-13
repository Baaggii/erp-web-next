import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import {
  lockTransactionsForReport,
  activateReportTransactionLocks,
  releaseReportTransactionLocks,
  listLockedTransactions,
  recordReportApproval,
  getReportApprovalRecord,
  pool,
} from '../../db/index.js';
import { tenantDataPath } from '../utils/dataPaths.js';
import { queryWithTenantScope } from './tenantScope.js';

const REPORT_ARCHIVE_DIR = 'report-approvals';

async function persistApprovalSnapshot({
  companyId,
  requestId,
  snapshot,
  procedure,
  parameters,
}) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  const normalizedRequestId = String(requestId ?? '').trim();
  if (!normalizedRequestId) {
    return null;
  }
  const normalizedCompanyId =
    companyId === undefined || companyId === null ? 0 : companyId;
  const relativePath = path.join(
    REPORT_ARCHIVE_DIR,
    `${normalizedRequestId}.json`,
  );
  const absolutePath = tenantDataPath(relativePath, normalizedCompanyId);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const archivedAt = new Date().toISOString();
  const payload = {
    version: 1,
    archivedAt,
    requestId: normalizedRequestId,
    companyId: normalizedCompanyId,
    procedure: procedure || null,
    parameters:
      parameters && typeof parameters === 'object' && !Array.isArray(parameters)
        ? parameters
        : {},
    snapshot,
  };
  await fs.writeFile(absolutePath, JSON.stringify(payload, null, 2));
  const stats = await fs.stat(absolutePath);
  return {
    filePath: relativePath,
    fileName: `${normalizedRequestId}.json`,
    mimeType: 'application/json',
    byteSize: stats.size,
    archivedAt,
  };
}

export async function createReportApprovalLocks(
  { companyId, requestId, transactions, createdBy },
  conn,
) {
  return lockTransactionsForReport(
    { companyId, requestId, transactions, createdBy },
    conn,
  );
}

export async function finalizeReportApprovalRequest(
  {
    companyId,
    requestId,
    procedure,
    parameters,
    approvedBy,
    transactions,
    snapshot,
  },
  conn,
) {
  const snapshotMeta = await persistApprovalSnapshot({
    companyId,
    requestId,
    snapshot,
    procedure,
    parameters,
  });
  await recordReportApproval(
    {
      companyId,
      requestId,
      procedureName: procedure,
      parameters,
      approvedBy,
      snapshotMeta,
    },
    conn,
  );
  await activateReportTransactionLocks({ requestId, finalizedBy: approvedBy }, conn);
  return Array.isArray(transactions) ? transactions : [];
}

export async function releaseReportApprovalLocks({ requestId }, conn) {
  await releaseReportTransactionLocks({ requestId }, conn);
}

export async function listLockedTransactionsForTable({ tableName, companyId } = {}) {
  return listLockedTransactions({ tableName, companyId });
}

export async function loadReportApprovalArchive({ requestId, viewerEmpId }) {
  const normalizedRequestId = String(requestId ?? '').trim();
  if (!normalizedRequestId) {
    const err = new Error('requestId required');
    err.status = 400;
    throw err;
  }
  const normalizedViewer = String(viewerEmpId ?? '')
    .trim()
    .toUpperCase();
  if (!normalizedViewer) {
    const err = new Error('viewer required');
    err.status = 403;
    throw err;
  }
  const approvalRecord = await getReportApprovalRecord(normalizedRequestId);
  if (!approvalRecord) {
    const err = new Error('Report approval request not found');
    err.status = 404;
    throw err;
  }
  const [pendingRows] = await queryWithTenantScope(
    pool,
    'pending_request',
    approvalRecord.companyId,
    `SELECT request_id,
            emp_id,
            response_empid,
            senior_empid,
            senior_plan_empid,
            company_id,
            status,
            request_type
       FROM {{table}}
      WHERE request_id = ?
      LIMIT 1`,
    [normalizedRequestId],
  );
  if (!pendingRows.length) {
    const err = new Error('Report approval request not found');
    err.status = 404;
    throw err;
  }
  const pending = pendingRows[0];
  if (pending.request_type !== 'report_approval') {
    const err = new Error('Report approval request not found');
    err.status = 404;
    throw err;
  }
  if ((pending.status || '').toLowerCase() !== 'accepted') {
    const err = new Error('Report approval not finalized');
    err.status = 404;
    throw err;
  }
  if (!approvalRecord.snapshotFilePath) {
    const err = new Error('Archived report not found');
    err.status = 404;
    throw err;
  }
  const allowed = new Set(
    [
      pending.emp_id,
      pending.response_empid,
      pending.senior_empid,
      pending.senior_plan_empid,
      approvalRecord.approvedBy,
    ]
      .filter((val) => val !== undefined && val !== null)
      .map((val) => String(val).trim().toUpperCase())
      .filter((val) => val),
  );
  if (!allowed.has(normalizedViewer)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const companyId =
    approvalRecord.companyId ?? pending.company_id ?? pending.companyId ?? 0;
  const absolutePath = tenantDataPath(
    approvalRecord.snapshotFilePath,
    companyId ?? 0,
  );
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      const notFound = new Error('Archived report not found');
      notFound.status = 404;
      throw notFound;
    }
    throw err;
  }
  const stream = createReadStream(absolutePath);
  const byteSize =
    approvalRecord.snapshotFileSize === null ||
    approvalRecord.snapshotFileSize === undefined
      ? stats.size
      : approvalRecord.snapshotFileSize;
  return {
    stream,
    mimeType: approvalRecord.snapshotFileMime || 'application/json',
    fileName:
      approvalRecord.snapshotFileName || path.basename(absolutePath) || null,
    byteSize,
    archivedAt: approvalRecord.snapshotArchivedAt || null,
  };
}

export const __test__ = {
  persistApprovalSnapshot,
};

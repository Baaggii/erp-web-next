import {
  lockTransactionsForReport,
  activateReportTransactionLocks,
  releaseReportTransactionLocks,
  listLockedTransactions,
  recordReportApproval,
} from '../../db/index.js';

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
  { companyId, requestId, procedure, parameters, approvedBy, transactions },
  conn,
) {
  await recordReportApproval(
    {
      companyId,
      requestId,
      procedureName: procedure,
      parameters,
      approvedBy,
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

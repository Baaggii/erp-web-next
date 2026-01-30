import { pool } from '../../db/index.js';

export async function enqueueTransactionNotificationJob({
  tableName,
  recordId,
  companyId,
  action,
  createdByEmpId,
}) {
  if (!tableName || !recordId || !companyId || !action) return null;
  const normalizedTable = String(tableName).trim();
  const normalizedRecordId = String(recordId).trim();
  const normalizedAction = String(action).trim().toLowerCase();
  if (!normalizedTable || !normalizedRecordId || !normalizedAction) return null;
  const normalizedCompanyId = Number(companyId);
  if (!Number.isFinite(normalizedCompanyId)) return null;
  await pool.query(
    `INSERT INTO notification_jobs (table_name, record_id, company_id, action, created_by_empid)
     VALUES (?, ?, ?, ?, ?)` ,
    [
      normalizedTable,
      normalizedRecordId,
      normalizedCompanyId,
      normalizedAction,
      createdByEmpId ? String(createdByEmpId) : null,
    ],
  );
  return true;
}

export async function claimNextNotificationJob(conn) {
  const [rows] = await conn.query(
    `SELECT * FROM notification_jobs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE`,
  );
  if (!rows.length) return null;
  const job = rows[0];
  await conn.query(
    `UPDATE notification_jobs
     SET status = 'processing', attempts = attempts + 1
     WHERE id = ?`,
    [job.id],
  );
  return job;
}

export async function markNotificationJobDone(conn, jobId) {
  await conn.query(
    `UPDATE notification_jobs SET status = 'done', last_error = NULL WHERE id = ?`,
    [jobId],
  );
}

export async function markNotificationJobFailed(conn, jobId, errorMessage) {
  await conn.query(
    `UPDATE notification_jobs
     SET status = 'failed', last_error = ?
     WHERE id = ?`,
    [errorMessage?.slice(0, 2000) || 'Unknown error', jobId],
  );
}

import { pool, getTableRowById } from '../../db/index.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { sendEmail } from './emailService.js';
import {
  claimNextNotificationJob,
  markNotificationJobDone,
  markNotificationJobFailed,
} from './transactionNotificationJobs.js';

const DEFAULT_POLL_MS = 2000;

function normalizeFieldList(fields) {
  if (!fields) return [];
  if (Array.isArray(fields)) {
    return fields.map((f) => String(f).trim()).filter(Boolean);
  }
  if (typeof fields === 'string') {
    const trimmed = fields.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function getCaseInsensitive(row, field) {
  if (!row || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  const lower = String(field).toLowerCase();
  const key = Object.keys(row).find((k) => String(k).toLowerCase() === lower);
  return key ? row[key] : undefined;
}

function expandValues(rawValue) {
  if (rawValue === undefined || rawValue === null) return [];
  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((value) => expandValues(value));
  }
  if (typeof rawValue === 'object') {
    return Object.values(rawValue).flatMap((value) => expandValues(value));
  }
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return expandValues(parsed);
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  return [rawValue];
}

function normalizeNumericValues(values) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)),
    ),
  );
}

function normalizeStringValues(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => value),
    ),
  );
}

function pickConfigEntry(configs = {}, row = {}) {
  for (const [name, cfg] of Object.entries(configs)) {
    if (!cfg?.transactionTypeValue) continue;
    if (cfg.transactionTypeField) {
      const val = getCaseInsensitive(row, cfg.transactionTypeField);
      if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
        return { name, config: cfg };
      }
    } else {
      const matchField = Object.keys(row).find(
        (k) => String(getCaseInsensitive(row, k)) === String(cfg.transactionTypeValue),
      );
      if (matchField) {
        return { name, config: { ...cfg, transactionTypeField: matchField } };
      }
    }
  }
  const [fallbackName, fallbackConfig] = Object.entries(configs)[0] || [];
  return { name: fallbackName || 'Other transaction', config: fallbackConfig || {} };
}

function buildSummary(fields, row) {
  const normalizedFields = normalizeFieldList(fields);
  if (!normalizedFields.length) return '';
  const parts = normalizedFields
    .map((field) => {
      const value = getCaseInsensitive(row, field);
      if (value === undefined || value === null) return null;
      const expanded = expandValues(value);
      if (!expanded.length) return null;
      return expanded.map((val) => String(val)).join(', ');
    })
    .filter(Boolean);
  return parts.join(' · ');
}

async function fetchCompanyRecipients(companyIds) {
  if (!companyIds.length) return [];
  const placeholders = companyIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT empid FROM users WHERE company_id IN (${placeholders})`,
    companyIds,
  );
  return rows.map((row) => row.empid).filter(Boolean);
}

async function fetchDepartmentRecipients(departmentIds, companyId) {
  if (!departmentIds.length || !companyId) return [];
  const placeholders = departmentIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT DISTINCT u.empid
     FROM users u
     JOIN tbl_employment e ON e.employment_emp_id = u.empid
     WHERE u.company_id = ?
       AND e.employment_company_id = ?
       AND e.employment_department_id IN (${placeholders})`,
    [companyId, companyId, ...departmentIds],
  );
  return rows.map((row) => row.empid).filter(Boolean);
}

async function fetchBranchRecipients(branchIds, companyId) {
  if (!branchIds.length || !companyId) return [];
  const placeholders = branchIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT DISTINCT u.empid
     FROM users u
     JOIN tbl_employment e ON e.employment_emp_id = u.empid
     WHERE u.company_id = ?
       AND e.employment_company_id = ?
       AND e.employment_branch_id IN (${placeholders})`,
    [companyId, companyId, ...branchIds],
  );
  return rows.map((row) => row.empid).filter(Boolean);
}

async function insertNotifications({
  recipients,
  companyId,
  createdByEmpId,
  action,
  transactionName,
  tableName,
  recordId,
  summary,
  createdAt,
}) {
  if (!recipients.length) return { inserted: 0, firstId: null };
  const message = summary || `${transactionName} ${action}`.trim();
  const numericRelatedId = Number(recordId);
  const relatedId = Number.isFinite(numericRelatedId) ? numericRelatedId : 0;
  const placeholders = recipients.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(', ');
  const values = recipients.flatMap((recipient) => [
    companyId,
    recipient,
    'transaction',
    relatedId,
    message,
    createdByEmpId,
    transactionName,
    tableName,
    String(recordId),
    action,
    summary,
  ]);
  const [result] = await pool.query(
    `INSERT INTO notifications
     (company_id, recipient_empid, type, related_id, message, created_by,
      transaction_name, transaction_table, transaction_record_id, action, summary)
     VALUES ${placeholders}`,
    values,
  );
  return {
    inserted: recipients.length,
    firstId: result?.insertId ?? null,
    createdAt,
  };
}

async function processNotificationJob(job, io) {
  const companyId = Number(job.company_id);
  const recordId = String(job.record_id);
  const tableName = String(job.table_name);
  const action = String(job.action || '').toLowerCase();
  const createdByEmpId = job.created_by_empid ? String(job.created_by_empid) : null;

  const row = await getTableRowById(tableName, recordId, {
    defaultCompanyId: companyId,
  });
  if (!row) {
    throw new Error('Transaction row not found');
  }

  let configs = {};
  try {
    const { config } = await getConfigsByTable(tableName, companyId);
    configs = config || {};
  } catch {
    configs = {};
  }

  const { name: transactionName, config } = pickConfigEntry(configs, row);
  const summary = buildSummary(config?.notificationDashboardFields, row);

  const employeeFields = normalizeFieldList(config?.notificationEmployeeFields);
  const companyFields = normalizeFieldList(config?.notificationCompanyFields);
  const departmentFields = normalizeFieldList(config?.notificationDepartmentFields);
  const branchFields = normalizeFieldList(config?.notificationBranchFields);
  const customerFields = normalizeFieldList(config?.notificationCustomerFields);
  const emailFields = normalizeFieldList(config?.notificationEmailFields);

  const employeeValues = employeeFields.flatMap((field) =>
    expandValues(getCaseInsensitive(row, field)),
  );
  const companyValues = companyFields.flatMap((field) =>
    expandValues(getCaseInsensitive(row, field)),
  );
  const departmentValues = departmentFields.flatMap((field) =>
    expandValues(getCaseInsensitive(row, field)),
  );
  const branchValues = branchFields.flatMap((field) =>
    expandValues(getCaseInsensitive(row, field)),
  );
  const customerValues = customerFields.flatMap((field) =>
    expandValues(getCaseInsensitive(row, field)),
  );
  const emailValues = emailFields.flatMap((field) =>
    expandValues(getCaseInsensitive(row, field)),
  );

  const employeeRecipients = normalizeStringValues(employeeValues);
  const companyRecipients = companyFields.length
    ? await fetchCompanyRecipients(normalizeNumericValues(companyValues))
    : [];
  const departmentRecipients = await fetchDepartmentRecipients(
    normalizeNumericValues(departmentValues),
    companyId,
  );
  const branchRecipients = await fetchBranchRecipients(
    normalizeNumericValues(branchValues),
    companyId,
  );

  const recipients = normalizeStringValues([
    ...employeeRecipients,
    ...companyRecipients,
    ...departmentRecipients,
    ...branchRecipients,
  ]);

  const createdAt = new Date().toISOString();
  const insertResult = await insertNotifications({
    recipients,
    companyId,
    createdByEmpId,
    action,
    transactionName,
    tableName,
    recordId,
    summary,
    createdAt,
  });

  const emails = normalizeStringValues([
    ...customerValues,
    ...emailValues,
  ]).filter((value) => value.includes('@'));

  if (emails.length) {
    const subject = `${transactionName} ${action}`.trim();
    const html = summary || messageForEmail(transactionName, action, recordId);
    await Promise.allSettled(
      emails.map((email) =>
        sendEmail(email, subject, html).catch((err) => {
          console.warn('Failed to send notification email', { email, err });
        }),
      ),
    );
  }

  if (io && insertResult?.inserted && insertResult?.firstId) {
    recipients.forEach((recipient, index) => {
      const notificationId = insertResult.firstId + index;
      io.to(`emp:${recipient}`).emit('notification:new', {
        notificationId,
        transactionName,
        action,
        summary,
        createdAt: insertResult.createdAt,
        tableName,
        recordId,
        isRead: false,
      });
    });
  }
}

function messageForEmail(transactionName, action, recordId) {
  return `<p>${transactionName} (${action}) - Record ${recordId}</p>`;
}

export function startTransactionNotificationWorker(io, options = {}) {
  const pollIntervalMs = Number(options.pollIntervalMs || process.env.NOTIFICATION_WORKER_POLL_MS || DEFAULT_POLL_MS);
  let timer = null;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      const job = await claimNextNotificationJob(conn);
      await conn.commit();
      if (!job) return;
      try {
        await processNotificationJob(job, io);
        await markNotificationJobDone(pool, job.id);
      } catch (err) {
        console.error('Notification job failed', err);
        await markNotificationJobFailed(pool, job.id, err?.message || String(err));
      }
    } catch (err) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {}
      }
      console.error('Notification worker loop failed', err);
    } finally {
      if (conn) conn.release();
      running = false;
    }
  };

  timer = setInterval(() => {
    tick().catch((err) => {
      console.error('Notification worker tick failed', err);
    });
  }, pollIntervalMs);

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

import { pool, getTableRowById } from '../../db/index.js';
import { getDisplayFields } from './displayFieldConfig.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { sendEmail } from './emailService.js';

const queue = [];
let processing = false;

function normalizeScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  return String(value).trim() || null;
}

function parseJsonValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractValues(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractValues(item));
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => extractValues(item));
  }
  const parsed = parseJsonValue(value);
  if (parsed !== null) return extractValues(parsed);
  const normalized = normalizeScalar(value);
  return normalized ? [normalized] : [];
}

function getCaseInsensitive(row, field) {
  if (!row || !field) return undefined;
  if (row[field] !== undefined) return row[field];
  const lower = String(field).toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key ? row[key] : undefined;
}

function collectFieldValues(row, fields = []) {
  const values = [];
  fields.forEach((field) => {
    if (!field) return;
    const raw = getCaseInsensitive(row, field);
    values.push(...extractValues(raw));
  });
  return values;
}

function collectEmails(values = []) {
  const emails = [];
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  values.forEach((value) => {
    const normalized = normalizeScalar(value);
    if (!normalized) return;
    const parsed = parseJsonValue(normalized);
    if (parsed !== null) {
      emails.push(...collectEmails(extractValues(parsed)));
      return;
    }
    if (emailPattern.test(normalized)) {
      emails.push(normalized);
    }
  });
  return emails;
}

async function resolveTransactionName(tableName, companyId, row) {
  try {
    const { config } = await getConfigsByTable(tableName, companyId);
    const configs = config || {};
    const matches = [];
    for (const [name, cfg] of Object.entries(configs)) {
      if (!cfg) continue;
      if (cfg.transactionTypeValue) {
        if (cfg.transactionTypeField) {
          const val = getCaseInsensitive(row, cfg.transactionTypeField);
          if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
            return name;
          }
        } else {
          matches.push(name);
        }
      } else {
        matches.push(name);
      }
    }
    if (matches.length) return matches[0];
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('Failed to resolve transaction name', err);
    }
  }
  return tableName;
}

function buildNotificationMessage(transactionName, action, row, displayFields = []) {
  const summaryParts = displayFields
    .flatMap((field) => {
      const value = getCaseInsensitive(row, field);
      return extractValues(value);
    })
    .map((val) => String(val).trim())
    .filter(Boolean);
  const summary = summaryParts.length ? summaryParts.join(' · ') : '';
  const actionLabel = action ? String(action).toLowerCase() : 'update';
  if (summary) {
    return `${transactionName} (${actionLabel}) · ${summary}`;
  }
  return `${transactionName} (${actionLabel})`;
}

async function resolveCompanyRecipients(companyIds) {
  if (!companyIds.length) return [];
  const placeholders = companyIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT empid FROM users WHERE company_id IN (${placeholders})`,
    companyIds,
  );
  return rows.map((row) => row.empid).filter(Boolean);
}

async function resolveEmploymentRecipients({ companyId, departmentIds = [], branchIds = [] }) {
  const recipients = new Set();
  if (departmentIds.length) {
    const placeholders = departmentIds.map(() => '?').join(',');
    const params = [companyId, ...departmentIds];
    const [rows] = await pool.query(
      `SELECT employment_emp_id AS empid
         FROM tbl_employment
        WHERE employment_company_id = ?
          AND employment_department_id IN (${placeholders})`,
      params,
    );
    rows.forEach((row) => {
      if (row.empid) recipients.add(row.empid);
    });
  }
  if (branchIds.length) {
    const placeholders = branchIds.map(() => '?').join(',');
    const params = [companyId, ...branchIds];
    const [rows] = await pool.query(
      `SELECT employment_emp_id AS empid
         FROM tbl_employment
        WHERE employment_company_id = ?
          AND employment_branch_id IN (${placeholders})`,
      params,
    );
    rows.forEach((row) => {
      if (row.empid) recipients.add(row.empid);
    });
  }
  return Array.from(recipients);
}

async function handleJob(job) {
  const { tableName, recordId, companyId, action, createdBy, io } = job || {};
  if (!tableName || recordId === undefined || recordId === null) return;

  const normalizedCompanyId = Number.isFinite(Number(companyId)) ? Number(companyId) : null;

  const { config } = await getDisplayFields(tableName, normalizedCompanyId ?? 0);
  const notificationEmployeeFields = config?.notificationEmployeeFields || [];
  const notificationCompanyFields = config?.notificationCompanyFields || [];
  const notificationDepartmentFields = config?.notificationDepartmentFields || [];
  const notificationBranchFields = config?.notificationBranchFields || [];
  const notificationCustomerFields = config?.notificationCustomerFields || [];
  const notificationEmailFields = config?.notificationEmailFields || [];
  const displayFields = config?.displayFields || [];

  const hasNotificationConfig =
    notificationEmployeeFields.length ||
    notificationCompanyFields.length ||
    notificationDepartmentFields.length ||
    notificationBranchFields.length ||
    notificationCustomerFields.length ||
    notificationEmailFields.length;
  if (!hasNotificationConfig) return;

  const row = await getTableRowById(tableName, recordId, {
    defaultCompanyId: normalizedCompanyId ?? undefined,
  });
  if (!row) return;

  const transactionName = await resolveTransactionName(
    tableName,
    normalizedCompanyId ?? 0,
    row,
  );
  const message = buildNotificationMessage(transactionName, action, row, displayFields);

  const employeeValues = collectFieldValues(row, notificationEmployeeFields);
  const companyValues = collectFieldValues(row, notificationCompanyFields);
  const departmentValues = collectFieldValues(row, notificationDepartmentFields);
  const branchValues = collectFieldValues(row, notificationBranchFields);
  const customerValues = collectFieldValues(row, notificationCustomerFields);
  const emailValues = collectFieldValues(row, notificationEmailFields);

  const companyIds = Array.from(new Set(companyValues.map((val) => Number(val)).filter(Number.isFinite)));
  const departmentIds = Array.from(
    new Set(departmentValues.map((val) => Number(val)).filter(Number.isFinite)),
  );
  const branchIds = Array.from(new Set(branchValues.map((val) => Number(val)).filter(Number.isFinite)));

  const recipients = new Set(employeeValues.map((val) => String(val).trim()).filter(Boolean));
  const [companyRecipients, employmentRecipients] = await Promise.all([
    resolveCompanyRecipients(companyIds),
    normalizedCompanyId !== null
      ? resolveEmploymentRecipients({ companyId: normalizedCompanyId, departmentIds, branchIds })
      : Promise.resolve([]),
  ]);
  companyRecipients.forEach((empid) => recipients.add(String(empid).trim()));
  employmentRecipients.forEach((empid) => recipients.add(String(empid).trim()));

  const emailRecipients = new Set([
    ...collectEmails(customerValues),
    ...collectEmails(emailValues),
  ]);

  const recipientList = Array.from(recipients).filter(Boolean);
  if (recipientList.length === 0 && emailRecipients.size === 0) return;

  const notifications = recipientList.map((recipient) => ({
    companyId: normalizedCompanyId ?? null,
    recipient,
    transactionName,
    tableName,
    recordId: String(recordId),
    action,
    message,
    createdBy: createdBy ?? null,
  }));

  let inserted = [];
  if (notifications.length) {
    const values = notifications
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .join(', ');
    const params = [];
    notifications.forEach((note) => {
      params.push(
        note.companyId,
        note.recipient,
        'transaction',
        0,
        note.message,
        note.createdBy,
        note.transactionName,
        note.tableName,
        note.recordId,
        note.action,
      );
    });
    const [result] = await pool.query(
      `INSERT INTO notifications (
        company_id,
        recipient_empid,
        type,
        related_id,
        message,
        created_by,
        transaction_name,
        transaction_table,
        record_id,
        action
      ) VALUES ${values}`,
      params,
    );
    const firstId = result?.insertId ? Number(result.insertId) : null;
    if (firstId && Number.isFinite(firstId)) {
      inserted = notifications.map((note, idx) => ({
        ...note,
        notificationId: firstId + idx,
      }));
    } else {
      inserted = notifications;
    }
  }

  if (emailRecipients.size) {
    const subject = `${transactionName} ${action || 'update'}`.trim();
    const html = `<p>${message}</p>`;
    const emailList = Array.from(emailRecipients);
    await Promise.all(
      emailList.map(async (email) => {
        try {
          await sendEmail(email, subject, html);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn('Failed to send notification email', err);
          }
        }
      }),
    );
  }

  if (io && inserted.length) {
    inserted.forEach((note) => {
      const payload = {
        notificationId: note.notificationId,
        transactionName: note.transactionName,
        tableName: note.tableName,
        recordId: note.recordId,
        action: note.action,
        message: note.message,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      io.to(`emp:${note.recipient}`).emit('notification:new', payload);
    });
  }
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const job = queue.shift();
    try {
      await handleJob(job);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('Notification worker failed', err);
      }
    }
  }
  processing = false;
}

export function enqueueTransactionNotificationJob(job) {
  if (!job) return;
  queue.push(job);
  setImmediate(() => {
    processQueue().catch(() => {});
  });
}

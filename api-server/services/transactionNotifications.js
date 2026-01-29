import { pool, listTableColumnMeta } from '../../db/index.js';
import { sendEmail } from './emailService.js';

const NOTIFICATION_TYPES = [
  'company',
  'department',
  'branch',
  'employee',
  'customer',
];

function arrify(value) {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === undefined || value === null) return [];
  return [String(value)];
}

function normalizeNotificationGroup(group = {}) {
  if (!group || typeof group !== 'object') return {
    relationFields: [],
    emailFields: [],
    phoneFields: [],
  };
  return {
    relationFields: arrify(group.relationFields),
    emailFields: arrify(group.emailFields),
    phoneFields: arrify(group.phoneFields),
  };
}

function normalizeNotificationConfig(raw = {}) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  NOTIFICATION_TYPES.forEach((type) => {
    result[type] = normalizeNotificationGroup(base[type]);
  });
  return result;
}

function isJsonLike(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return true;
  if (typeof value === 'object') return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function extractIdsFromRow(fields, row, columnTypeMap) {
  const ids = new Set();
  let notifyAll = false;
  fields.forEach((field) => {
    const key = String(field || '').trim();
    if (!key) return;
    const value = row?.[key];
    const dataType = columnTypeMap.get(key);
    if (dataType === 'json' || isJsonLike(value)) {
      notifyAll = true;
      return;
    }
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      notifyAll = true;
      return;
    }
    const normalized = String(value).trim();
    if (normalized) ids.add(normalized);
  });
  return { ids, notifyAll };
}

function extractEmailsFromRow(fields, row) {
  const emails = new Set();
  const addIfEmail = (value) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized && normalized.includes('@')) emails.add(normalized);
  };
  fields.forEach((field) => {
    const key = String(field || '').trim();
    if (!key) return;
    const value = row?.[key];
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((entry) => addIfEmail(entry));
      return;
    }
    addIfEmail(value);
  });
  return emails;
}

async function listEmployeesByCompanyIds(companyIds = []) {
  if (!companyIds.length) return [];
  const [rows] = await pool.query(
    'SELECT DISTINCT empid FROM users WHERE company_id IN (?)',
    [companyIds],
  );
  return rows.map((row) => String(row.empid)).filter(Boolean);
}

async function listEmployeesByDepartmentIds(departmentIds = [], companyIds = []) {
  if (!departmentIds.length) return [];
  const params = [];
  let companyClause = '';
  if (companyIds.length) {
    companyClause = 'AND e.company_id IN (?)';
    params.push(companyIds);
  }
  params.unshift(departmentIds);
  const [rows] = await pool.query(
    `SELECT DISTINCT u.empid
       FROM users u
       JOIN tbl_employment e ON e.employment_emp_id = u.empid
      WHERE e.employment_department_id IN (?)
        ${companyClause}`,
    params,
  );
  return rows.map((row) => String(row.empid)).filter(Boolean);
}

async function listEmployeesByBranchIds(branchIds = [], companyIds = []) {
  if (!branchIds.length) return [];
  const params = [];
  let companyClause = '';
  if (companyIds.length) {
    companyClause = 'AND e.company_id IN (?)';
    params.push(companyIds);
  }
  params.unshift(branchIds);
  const [rows] = await pool.query(
    `SELECT DISTINCT u.empid
       FROM users u
       JOIN tbl_employment e ON e.employment_emp_id = u.empid
      WHERE e.employment_branch_id IN (?)
        ${companyClause}`,
    params,
  );
  return rows.map((row) => String(row.empid)).filter(Boolean);
}

async function insertNotifications({
  recipients,
  message,
  relatedId,
  companyId,
  createdBy,
  type = 'transaction',
}) {
  if (!recipients || recipients.length === 0) return;
  const values = recipients.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];
  recipients.forEach((recipient) => {
    params.push(
      companyId ?? null,
      recipient,
      type,
      relatedId ?? null,
      message ?? '',
      createdBy ?? null,
    );
  });
  await pool.query(
    `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
     VALUES ${values}`,
    params,
  );
}

export async function createTransactionNotifications({
  tableName,
  row,
  formName,
  formConfig,
  recordId,
  companyId,
  createdBy,
}) {
  if (!tableName || !row || !formConfig) return;
  const notificationConfig = normalizeNotificationConfig(formConfig.notificationConfig);
  const hasNotificationFields = Object.values(notificationConfig).some(
    (group) =>
      group.relationFields.length > 0 ||
      group.emailFields.length > 0 ||
      group.phoneFields.length > 0,
  );
  if (!hasNotificationFields && (!formConfig.emailField || formConfig.emailField.length === 0)) {
    return;
  }

  let columnMeta = [];
  try {
    columnMeta = await listTableColumnMeta(tableName, companyId);
  } catch {
    columnMeta = [];
  }
  const columnTypeMap = new Map(
    columnMeta.map((col) => [String(col.name), String(col.dataType || '').toLowerCase()]),
  );

  const recipients = new Set();
  const emails = new Set();
  const notificationCompanyIds = new Set();

  const normalizedCompanyId =
    row.company_id ?? row.companyId ?? companyId ?? null;
  const fallbackCompanyIds =
    normalizedCompanyId != null ? [String(normalizedCompanyId)] : [];

  const transactionLabel = formName || tableName;
  const message = JSON.stringify({
    table: tableName,
    formName: transactionLabel,
    recordId: recordId ?? null,
    label: `New ${transactionLabel} transaction`,
  });

  const addRecipients = (list = []) => {
    list.forEach((id) => {
      const normalized = String(id || '').trim();
      if (normalized) recipients.add(normalized);
    });
  };

  const addEmails = (list = []) => {
    list.forEach((email) => {
      const normalized = String(email || '').trim();
      if (normalized && normalized.includes('@')) emails.add(normalized);
    });
  };

  const employeeConfig = notificationConfig.employee;
  const employeeValues = extractIdsFromRow(
    employeeConfig.relationFields.length > 0
      ? employeeConfig.relationFields
      : arrify(formConfig.userIdFields),
    row,
    columnTypeMap,
  );
  if (employeeValues.notifyAll) {
    if (normalizedCompanyId != null) notificationCompanyIds.add(String(normalizedCompanyId));
  } else {
    addRecipients(Array.from(employeeValues.ids));
  }
  addEmails(Array.from(extractEmailsFromRow(employeeConfig.emailFields, row)));

  const companyConfig = notificationConfig.company;
  const companyValues = extractIdsFromRow(
    companyConfig.relationFields.length > 0
      ? companyConfig.relationFields
      : arrify(formConfig.companyIdFields),
    row,
    columnTypeMap,
  );
  if (companyValues.notifyAll) {
    if (normalizedCompanyId != null) notificationCompanyIds.add(String(normalizedCompanyId));
  } else {
    companyValues.ids.forEach((id) => notificationCompanyIds.add(id));
  }
  addEmails(Array.from(extractEmailsFromRow(companyConfig.emailFields, row)));

  const branchConfig = notificationConfig.branch;
  const branchValues = extractIdsFromRow(
    branchConfig.relationFields.length > 0
      ? branchConfig.relationFields
      : arrify(formConfig.branchIdFields),
    row,
    columnTypeMap,
  );
  if (branchValues.notifyAll) {
    if (normalizedCompanyId != null) notificationCompanyIds.add(String(normalizedCompanyId));
  } else {
    const branchIds = Array.from(branchValues.ids);
    if (branchIds.length > 0) {
      const companyIds = notificationCompanyIds.size
        ? Array.from(notificationCompanyIds)
        : fallbackCompanyIds;
      const branchRecipients = await listEmployeesByBranchIds(branchIds, companyIds);
      addRecipients(branchRecipients);
    }
  }
  addEmails(Array.from(extractEmailsFromRow(branchConfig.emailFields, row)));

  const departmentConfig = notificationConfig.department;
  const departmentValues = extractIdsFromRow(
    departmentConfig.relationFields.length > 0
      ? departmentConfig.relationFields
      : arrify(formConfig.departmentIdFields),
    row,
    columnTypeMap,
  );
  if (departmentValues.notifyAll) {
    if (normalizedCompanyId != null) notificationCompanyIds.add(String(normalizedCompanyId));
  } else {
    const departmentIds = Array.from(departmentValues.ids);
    if (departmentIds.length > 0) {
      const companyIds = notificationCompanyIds.size
        ? Array.from(notificationCompanyIds)
        : fallbackCompanyIds;
      const departmentRecipients = await listEmployeesByDepartmentIds(
        departmentIds,
        companyIds,
      );
      addRecipients(departmentRecipients);
    }
  }
  addEmails(Array.from(extractEmailsFromRow(departmentConfig.emailFields, row)));

  if (notificationCompanyIds.size > 0) {
    const companyRecipients = await listEmployeesByCompanyIds(
      Array.from(notificationCompanyIds),
    );
    addRecipients(companyRecipients);
  }

  const customerConfig = notificationConfig.customer;
  const customerValues = extractIdsFromRow(
    customerConfig.relationFields,
    row,
    columnTypeMap,
  );
  if (!customerValues.notifyAll) {
    addEmails(Array.from(customerValues.ids));
  }
  addEmails(Array.from(extractEmailsFromRow(customerConfig.emailFields, row)));
  addEmails(Array.from(extractEmailsFromRow(formConfig.emailField || [], row)));

  if (recipients.size > 0) {
    await insertNotifications({
      recipients: Array.from(recipients),
      message,
      relatedId: recordId ?? null,
      companyId: normalizedCompanyId ?? null,
      createdBy,
      type: 'transaction',
    });
  }

  if (emails.size > 0) {
    const subject = `New ${transactionLabel} transaction`;
    const body = `A new ${transactionLabel} transaction has been created.`;
    await Promise.all(
      Array.from(emails).map(async (email) => {
        try {
          await sendEmail(email, subject, body);
        } catch (err) {
          console.error('Failed to send transaction notification email', err);
        }
      }),
    );
  }
}

export async function getTransactionNotificationSummary({ empid }) {
  if (!empid) return { totalCount: 0, unreadCount: 0 };
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS totalCount,
            SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unreadCount
       FROM notifications
      WHERE recipient_empid = ?
        AND type = 'transaction'
        AND deleted_at IS NULL`,
    [empid],
  );
  const row = rows?.[0] || {};
  return {
    totalCount: Number(row.totalCount) || 0,
    unreadCount: Number(row.unreadCount) || 0,
  };
}

export async function listTransactionNotifications({ empid, limit = 50, offset = 0 }) {
  if (!empid) return { rows: [], totalCount: 0, unreadCount: 0 };
  const [rows] = await pool.query(
    `SELECT notification_id,
            recipient_empid,
            type,
            related_id,
            message,
            is_read,
            created_at
       FROM notifications
      WHERE recipient_empid = ?
        AND type = 'transaction'
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [empid, Number(limit), Number(offset)],
  );

  const parsed = rows.map((row) => {
    let meta = null;
    if (typeof row.message === 'string') {
      try {
        const parsedMessage = JSON.parse(row.message);
        if (parsedMessage && typeof parsedMessage === 'object') meta = parsedMessage;
      } catch {
        meta = null;
      }
    }
    return { ...row, meta };
  });

  const summary = await getTransactionNotificationSummary({ empid });
  return { rows: parsed, ...summary };
}

export async function markTransactionNotificationsRead({ empid, ids = [], markAll = false }) {
  if (!empid) return 0;
  if (markAll) {
    const [result] = await pool.query(
      `UPDATE notifications
          SET is_read = 1
        WHERE recipient_empid = ?
          AND type = 'transaction'
          AND deleted_at IS NULL`,
      [empid],
    );
    return result?.affectedRows ?? 0;
  }
  const normalizedIds = ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
  if (normalizedIds.length === 0) return 0;
  const [result] = await pool.query(
    `UPDATE notifications
        SET is_read = 1
      WHERE recipient_empid = ?
        AND type = 'transaction'
        AND notification_id IN (?)`,
    [empid, normalizedIds],
  );
  return result?.affectedRows ?? 0;
}

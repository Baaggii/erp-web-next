import { pool, listTableColumnMeta } from '../../db/index.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { sendEmail } from './emailService.js';

const JSON_TYPES = new Set(['json']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getRowValue(row, field) {
  if (!row || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  const lower = String(field).toLowerCase();
  const match = Object.keys(row).find((key) => key.toLowerCase() === lower);
  return match ? row[match] : undefined;
}

function parseJsonValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizePrimitiveValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

function flattenValues(input, output) {
  if (input === undefined || input === null) return;
  if (Array.isArray(input)) {
    input.forEach((item) => flattenValues(item, output));
    return;
  }
  if (isPlainObject(input)) {
    Object.values(input).forEach((item) => flattenValues(item, output));
    return;
  }
  const normalized = normalizePrimitiveValue(input);
  if (normalized) output.push(normalized);
}

function normalizeFieldValues(value, { isJson = false } = {}) {
  const output = [];
  if (value === undefined || value === null) return output;
  const parsed = isJson ? parseJsonValue(value) : null;
  if (parsed !== null) {
    flattenValues(parsed, output);
    return output;
  }
  if (Array.isArray(value) || isPlainObject(value)) {
    flattenValues(value, output);
    return output;
  }
  if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
    const fallbackParsed = parseJsonValue(value);
    if (fallbackParsed !== null) {
      flattenValues(fallbackParsed, output);
      return output;
    }
  }
  flattenValues(value, output);
  return output;
}

function uniqueList(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function resolveNotificationConfig(tableName, row, companyId) {
  const { config: configMap } = await getConfigsByTable(tableName, companyId);
  const entries = Object.entries(configMap || {});
  if (entries.length === 0) {
    return { config: null, name: null };
  }
  const matches = [];
  entries.forEach(([name, config]) => {
    if (!config) return;
    const typeField = config.transactionTypeField || '';
    const typeValue = config.transactionTypeValue || '';
    if (typeField && typeValue) {
      const rowValue = getRowValue(row, typeField);
      if (rowValue !== undefined && rowValue !== null && String(rowValue) === String(typeValue)) {
        matches.push({ name, config });
      }
    }
  });
  if (matches.length > 0) {
    return matches[0];
  }
  if (entries.length === 1) {
    const [name, config] = entries[0];
    return { name, config };
  }
  const fallback = entries.find(([, config]) => !(config?.transactionTypeField || config?.transactionTypeValue));
  if (fallback) {
    const [name, config] = fallback;
    return { name, config };
  }
  const [name, config] = entries[0];
  return { name, config };
}

function buildTransactionLabel(tableName, configName, config) {
  const label =
    (typeof config?.moduleLabel === 'string' && config.moduleLabel.trim()) ||
    (typeof config?.moduleKey === 'string' && config.moduleKey.trim()) ||
    (typeof configName === 'string' && configName.trim()) ||
    tableName;
  return label || tableName;
}

async function fetchEmpIdsByCompanies(conn, companyIds) {
  if (!companyIds.length) return [];
  const placeholders = companyIds.map(() => '?').join(', ');
  const [rows] = await conn.query(
    `SELECT empid FROM users WHERE company_id IN (${placeholders})`,
    companyIds,
  );
  return rows.map((row) => row.empid).filter(Boolean);
}

async function fetchEmpIdsByDepartment(conn, departmentIds, companyId) {
  if (!departmentIds.length) return [];
  const placeholders = departmentIds.map(() => '?').join(', ');
  const params = [...departmentIds];
  let clause = `employment_department_id IN (${placeholders})`;
  if (companyId !== null && companyId !== undefined) {
    clause += ' AND employment_company_id = ?';
    params.push(companyId);
  }
  const [rows] = await conn.query(
    `SELECT DISTINCT employment_emp_id AS empid
       FROM tbl_employment
      WHERE ${clause}`,
    params,
  );
  return rows.map((row) => row.empid).filter(Boolean);
}

async function fetchEmpIdsByBranch(conn, branchIds, companyId) {
  if (!branchIds.length) return [];
  const placeholders = branchIds.map(() => '?').join(', ');
  const params = [...branchIds];
  let clause = `employment_branch_id IN (${placeholders})`;
  if (companyId !== null && companyId !== undefined) {
    clause += ' AND employment_company_id = ?';
    params.push(companyId);
  }
  const [rows] = await conn.query(
    `SELECT DISTINCT employment_emp_id AS empid
       FROM tbl_employment
      WHERE ${clause}`,
    params,
  );
  return rows.map((row) => row.empid).filter(Boolean);
}

async function insertNotifications(
  conn,
  { companyId, recipientEmpIds, relatedId, message, createdBy },
) {
  const recipients = uniqueList(recipientEmpIds);
  if (!recipients.length) return;
  const values = recipients.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];
  recipients.forEach((recipient) => {
    params.push(
      companyId ?? null,
      recipient,
      'request',
      relatedId ?? null,
      message ?? '',
      createdBy ?? null,
    );
  });
  await conn.query(
    `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
     VALUES ${values}`,
    params,
  );
}

function extractEmails(values) {
  const emails = [];
  values.forEach((value) => {
    if (!value) return;
    const trimmed = String(value).trim();
    if (trimmed && trimmed.includes('@')) {
      emails.push(trimmed);
    }
  });
  return emails;
}

export async function createTransactionNotifications({
  tableName,
  row,
  recordId,
  companyId,
  createdBy,
  config,
  configName,
  connection = null,
} = {}) {
  if (!tableName || !row) return { notified: false };
  const conn = connection || pool;
  const resolved =
    config || configName
      ? { config: config || null, name: configName || null }
      : await resolveNotificationConfig(tableName, row, companyId);
  const resolvedConfig = resolved?.config || null;
  if (!resolvedConfig) return { notified: false };

  const notificationFields = {
    employee: Array.isArray(resolvedConfig.notificationEmployeeFields)
      ? resolvedConfig.notificationEmployeeFields
      : [],
    company: Array.isArray(resolvedConfig.notificationCompanyFields)
      ? resolvedConfig.notificationCompanyFields
      : [],
    department: Array.isArray(resolvedConfig.notificationDepartmentFields)
      ? resolvedConfig.notificationDepartmentFields
      : [],
    branch: Array.isArray(resolvedConfig.notificationBranchFields)
      ? resolvedConfig.notificationBranchFields
      : [],
    customer: Array.isArray(resolvedConfig.notificationCustomerFields)
      ? resolvedConfig.notificationCustomerFields
      : [],
    email: Array.isArray(resolvedConfig.notificationEmailFields)
      ? resolvedConfig.notificationEmailFields
      : [],
  };

  const hasNotificationFields = Object.values(notificationFields).some(
    (list) => Array.isArray(list) && list.length > 0,
  );
  if (!hasNotificationFields) return { notified: false };

  let columnMeta = [];
  try {
    columnMeta = await listTableColumnMeta(tableName, companyId);
  } catch {
    columnMeta = [];
  }
  const columnTypeMap = new Map(
    columnMeta.map((col) => [
      String(col.name || col.COLUMN_NAME || '').toLowerCase(),
      String(col.dataType || col.DATA_TYPE || '').toLowerCase(),
    ]),
  );

  const collectFieldValues = (fields) => {
    const values = [];
    fields.forEach((field) => {
      if (!field) return;
      const key = String(field);
      const rowValue = getRowValue(row, key);
      if (rowValue === undefined) return;
      const dataType = columnTypeMap.get(key.toLowerCase()) || '';
      const isJson = JSON_TYPES.has(dataType);
      values.push(...normalizeFieldValues(rowValue, { isJson }));
    });
    return values;
  };

  const employeeIds = uniqueList(collectFieldValues(notificationFields.employee));
  const companyIds = uniqueList(collectFieldValues(notificationFields.company))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const departmentIds = uniqueList(collectFieldValues(notificationFields.department))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const branchIds = uniqueList(collectFieldValues(notificationFields.branch))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const recipients = new Set(employeeIds);
  if (companyIds.length) {
    const companyEmpIds = await fetchEmpIdsByCompanies(conn, companyIds);
    companyEmpIds.forEach((empid) => recipients.add(empid));
  }
  const resolvedCompanyId =
    row?.company_id ?? row?.companyId ?? companyId ?? null;
  if (departmentIds.length) {
    const deptEmpIds = await fetchEmpIdsByDepartment(
      conn,
      departmentIds,
      resolvedCompanyId,
    );
    deptEmpIds.forEach((empid) => recipients.add(empid));
  }
  if (branchIds.length) {
    const branchEmpIds = await fetchEmpIdsByBranch(
      conn,
      branchIds,
      resolvedCompanyId,
    );
    branchEmpIds.forEach((empid) => recipients.add(empid));
  }

  const transactionLabel = buildTransactionLabel(
    tableName,
    resolved?.name || configName,
    resolvedConfig,
  );
  const message = `[${transactionLabel}] New transaction #${recordId ?? ''}`.trim();

  if (recipients.size > 0) {
    await insertNotifications(conn, {
      companyId: resolvedCompanyId ?? companyId ?? null,
      recipientEmpIds: Array.from(recipients),
      relatedId: recordId ?? null,
      message,
      createdBy,
    });
  }

  const emailValues = [
    ...collectFieldValues(notificationFields.email),
    ...collectFieldValues(notificationFields.customer),
  ];
  const emailRecipients = uniqueList(extractEmails(emailValues));
  if (emailRecipients.length > 0) {
    await Promise.allSettled(
      emailRecipients.map((email) =>
        sendEmail(
          email,
          `New ${transactionLabel} transaction`,
          `<p>${message}</p>`,
        ),
      ),
    );
  }

  return {
    notified: recipients.size > 0 || emailRecipients.length > 0,
    recipientCount: recipients.size,
    emailCount: emailRecipients.length,
  };
}

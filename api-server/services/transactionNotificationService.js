import { pool, listTableColumnMeta, listTableRelationships } from '../../db/index.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { listCustomRelations } from './tableRelationsConfig.js';
import { sendEmail } from './emailService.js';

const DYNAMIC_SOURCE_TAG = '"source":"dynamic_transaction"';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeKey(key) {
  return typeof key === 'string' ? key.trim().toLowerCase() : '';
}

function getRowValue(row, field) {
  if (!row || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  const target = normalizeKey(field);
  const foundKey = Object.keys(row).find((key) => normalizeKey(key) === target);
  return foundKey ? row[foundKey] : undefined;
}

function normalizeValueList(raw, { isArray, isJson }) {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (isArray || isJson || trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') return Object.values(parsed);
        return [parsed];
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  if (raw && typeof raw === 'object') {
    if (isArray || isJson) return Object.values(raw);
    return [raw];
  }
  return [raw];
}

function normalizeValueStrings(values) {
  return values
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .filter(Boolean);
}

function looksLikeEmail(value) {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

function buildNotificationMessage({ transactionName, tableName, recordId, createdBy }) {
  return JSON.stringify({
    source: 'dynamic_transaction',
    transactionName,
    table: tableName,
    recordId,
    createdBy,
    summary: `New ${transactionName} transaction`,
  });
}

const RELATION_TABLES = {
  employee: new Set(['tbl_employee', 'tbl_employment', 'users']),
  company: new Set(['companies']),
  department: new Set(['code_department']),
  branch: new Set(['code_branches']),
  customer: new Set(['tbl_contracter', 'tbl_customer', 'customers']),
};

async function buildRelationMap(tableName, companyId) {
  const [dbRelations, custom] = await Promise.all([
    listTableRelationships(tableName),
    listCustomRelations(tableName, companyId),
  ]);
  const map = new Map();
  (dbRelations || []).forEach((relation) => {
    if (!relation?.COLUMN_NAME || !relation?.REFERENCED_TABLE_NAME) return;
    const key = normalizeKey(relation.COLUMN_NAME);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      table: relation.REFERENCED_TABLE_NAME,
      column: relation.REFERENCED_COLUMN_NAME,
      isArray: false,
    });
  });
  const customMap = custom?.config || {};
  Object.entries(customMap).forEach(([column, relations]) => {
    const key = normalizeKey(column);
    if (!map.has(key)) map.set(key, []);
    const list = Array.isArray(relations) ? relations : [];
    list.forEach((relation) => {
      if (!relation?.table || !relation?.column) return;
      map.get(key).push({
        table: relation.table,
        column: relation.column,
        isArray: Boolean(relation.isArray),
      });
    });
  });
  return map;
}

function pickTransactionConfig(configs, row) {
  const entries = Object.entries(configs || {});
  if (entries.length === 0) return null;
  const exactMatches = entries.filter(([, cfg]) => {
    const field = cfg?.transactionTypeField;
    if (!field) return false;
    const raw = getRowValue(row, field);
    if (raw === undefined || raw === null || raw === '') return false;
    if (!cfg.transactionTypeValue) return true;
    return String(raw) === String(cfg.transactionTypeValue);
  });
  if (exactMatches.length > 0) {
    const [name, config] = exactMatches[0];
    return { name, config };
  }
  if (entries.length === 1) {
    const [name, config] = entries[0];
    return { name, config };
  }
  return null;
}

async function findEmailColumn(tableName) {
  if (!tableName) return null;
  const meta = await listTableColumnMeta(tableName);
  const emailColumn = meta
    .map((col) => col.name)
    .find((name) => /email/i.test(name));
  return emailColumn || null;
}

async function fetchEmailsForRelation({ table, column, values }) {
  if (!table || !column || values.length === 0) return [];
  const emailColumn = await findEmailColumn(table);
  if (!emailColumn) return [];
  const [rows] = await pool.query(
    'SELECT ?? AS email FROM ?? WHERE ?? IN (?)',
    [emailColumn, table, column, values],
  );
  return rows
    .map((row) => row.email)
    .filter((value) => value !== undefined && value !== null && looksLikeEmail(value));
}

async function fetchRecipientsByCompany(companyIds) {
  if (!companyIds.length) return [];
  const [rows] = await pool.query(
    'SELECT DISTINCT empid FROM users WHERE company_id IN (?)',
    [companyIds],
  );
  return rows.map((row) => row.empid).filter(Boolean);
}

async function fetchRecipientsByDepartment(departmentIds, companyId) {
  if (!departmentIds.length) return [];
  const params = [departmentIds];
  let sql =
    'SELECT DISTINCT employment_emp_id AS empid FROM tbl_employment WHERE employment_department_id IN (?)';
  if (companyId) {
    sql += ' AND company_id = ?';
    params.push(companyId);
  }
  const [rows] = await pool.query(sql, params);
  return rows.map((row) => row.empid).filter(Boolean);
}

async function fetchRecipientsByBranch(branchIds, companyId) {
  if (!branchIds.length) return [];
  const params = [branchIds];
  let sql =
    'SELECT DISTINCT employment_emp_id AS empid FROM tbl_employment WHERE employment_branch_id IN (?)';
  if (companyId) {
    sql += ' AND company_id = ?';
    params.push(companyId);
  }
  const [rows] = await pool.query(sql, params);
  return rows.map((row) => row.empid).filter(Boolean);
}

function listConfiguredFields(config, key) {
  return Array.isArray(config?.[key])
    ? config[key].map((field) => String(field).trim()).filter(Boolean)
    : [];
}

export async function createDynamicTransactionNotifications({
  tableName,
  row,
  recordId,
  companyId,
  createdBy,
} = {}) {
  if (!tableName || !row) return null;
  const { config: configs } = await getConfigsByTable(tableName, companyId);
  const resolvedConfig = pickTransactionConfig(configs, row);
  if (!resolvedConfig) return null;
  const { name: transactionName, config } = resolvedConfig;

  const notificationFields = [
    'notificationCompanyFields',
    'notificationDepartmentFields',
    'notificationBranchFields',
    'notificationEmployeeFields',
    'notificationCustomerFields',
    'notificationEmailFields',
    'notificationPhoneFields',
  ];
  const hasAnyNotification = notificationFields.some(
    (field) => Array.isArray(config?.[field]) && config[field].length > 0,
  );
  if (!hasAnyNotification) return null;

  const [columnMeta, relationMap] = await Promise.all([
    listTableColumnMeta(tableName, companyId),
    buildRelationMap(tableName, companyId),
  ]);
  const metaLookup = new Map(
    (columnMeta || []).map((col) => [normalizeKey(col.name), col]),
  );

  const isRelationMatch = (field, allowedTables) => {
    const relations = relationMap.get(normalizeKey(field)) || [];
    if (!relations.length) return true;
    const normalizedAllowed = (Array.isArray(allowedTables)
      ? allowedTables
      : Array.from(allowedTables || [])
    ).map((value) => normalizeKey(value));
    return relations.some((relation) =>
      normalizedAllowed.includes(normalizeKey(relation.table)),
    );
  };

  const toValues = (field, allowedTables) => {
    if (!isRelationMatch(field, allowedTables)) return [];
    const key = normalizeKey(field);
    const meta = metaLookup.get(key);
    const relations = relationMap.get(key) || [];
    const isJson =
      meta?.dataType === 'json' ||
      (typeof meta?.columnType === 'string' && /json/i.test(meta.columnType));
    const isArray = relations.some((rel) => rel.isArray);
    const raw = getRowValue(row, field);
    return normalizeValueStrings(normalizeValueList(raw, { isArray, isJson }));
  };

  const employeeFieldValues = Array.from(
    new Set(
      listConfiguredFields(config, 'notificationEmployeeFields')
        .flatMap((field) => toValues(field, RELATION_TABLES.employee)),
    ),
  );
  const companyFieldValues = Array.from(
    new Set(
      listConfiguredFields(config, 'notificationCompanyFields')
        .flatMap((field) => toValues(field, RELATION_TABLES.company)),
    ),
  );
  const departmentFieldValues = Array.from(
    new Set(
      listConfiguredFields(config, 'notificationDepartmentFields')
        .flatMap((field) => toValues(field, RELATION_TABLES.department)),
    ),
  );
  const branchFieldValues = Array.from(
    new Set(
      listConfiguredFields(config, 'notificationBranchFields')
        .flatMap((field) => toValues(field, RELATION_TABLES.branch)),
    ),
  );

  const emailFieldValues = Array.from(
    new Set(
      listConfiguredFields(config, 'notificationEmailFields')
        .flatMap((field) => toValues(field))
        .filter(looksLikeEmail),
    ),
  );

  const companyIdValue =
    row?.company_id ?? row?.companyId ?? companyId ?? null;

  const recipientSet = new Set();
  employeeFieldValues.forEach((value) => recipientSet.add(value));
  const [companyRecipients, departmentRecipients, branchRecipients] = await Promise.all([
    fetchRecipientsByCompany(companyFieldValues),
    fetchRecipientsByDepartment(departmentFieldValues, companyIdValue),
    fetchRecipientsByBranch(branchFieldValues, companyIdValue),
  ]);
  companyRecipients.forEach((value) => recipientSet.add(value));
  departmentRecipients.forEach((value) => recipientSet.add(value));
  branchRecipients.forEach((value) => recipientSet.add(value));

  const emailSet = new Set(emailFieldValues);
  for (const field of listConfiguredFields(config, 'notificationCustomerFields')) {
    const values = toValues(field, RELATION_TABLES.customer);
    values.filter(looksLikeEmail).forEach((value) => emailSet.add(value));
    const relations = relationMap.get(normalizeKey(field)) || [];
    const lookupValues = values.filter((value) => !looksLikeEmail(value));
    for (const relation of relations) {
      if (!relation?.table || !relation?.column || lookupValues.length === 0) continue;
      // eslint-disable-next-line no-await-in-loop
      const emails = await fetchEmailsForRelation({
        table: relation.table,
        column: relation.column,
        values: lookupValues,
      });
      emails.forEach((email) => emailSet.add(email));
    }
  }

  const recipients = Array.from(recipientSet).filter(Boolean);
  const message = buildNotificationMessage({
    transactionName,
    tableName,
    recordId,
    createdBy,
  });

  if (recipients.length > 0) {
    const rows = recipients.map((recipient) => [
      companyIdValue ?? companyId ?? null,
      recipient,
      'request',
      recordId ?? 0,
      message,
      createdBy ?? null,
    ]);
    await pool.query(
      `INSERT INTO notifications
        (company_id, recipient_empid, type, related_id, message, created_by)
       VALUES ?`,
      [rows],
    );
  }

  const emails = Array.from(emailSet).filter(Boolean);
  if (emails.length > 0) {
    const subject = `New ${transactionName} transaction`;
    const html = `
      <p>${transactionName} has a new transaction.</p>
      <p>Transaction ID: ${recordId ?? '-'}</p>
    `;
    await Promise.all(
      emails.map((email) => sendEmail(email, subject, html).catch(() => null)),
    );
  }

  return {
    recipients: recipients.length,
    emails: emails.length,
    messageTag: DYNAMIC_SOURCE_TAG,
  };
}

export function isDynamicTransactionNotification(message = '') {
  if (!message || typeof message !== 'string') return false;
  return message.includes(DYNAMIC_SOURCE_TAG);
}

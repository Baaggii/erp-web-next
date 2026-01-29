import { pool, listTableColumnMeta, listTableRelationships } from '../../db/index.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { listCustomRelations } from './tableRelationsConfig.js';
import { sendEmail } from './emailService.js';

const DEFAULT_NOTIFICATION_LIMIT = 20;
const NOTIFICATION_TYPE = 'request';
const EMAIL_COLUMN_HINTS = ['email', 'email_address', 'mail'];

function normalizeString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeIdentifier(value) {
  const text = normalizeString(value);
  return text || null;
}

function getRowValue(row, field) {
  if (!row || !field) return undefined;
  if (row[field] !== undefined) return row[field];
  const lower = field.toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key ? row[key] : undefined;
}

function coerceJsonValues(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return Object.values(raw);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.values(parsed);
    } catch {
      return [raw];
    }
    return [raw];
  }
  return [raw];
}

function extractValues({ row, field, columnMeta }) {
  const raw = getRowValue(row, field);
  if (raw === undefined || raw === null || raw === '') return [];
  if (columnMeta?.dataType === 'json') {
    return coerceJsonValues(raw);
  }
  if (Array.isArray(raw) || typeof raw === 'object') {
    return coerceJsonValues(raw);
  }
  return [raw];
}

function dedupeValues(values) {
  const deduped = [];
  const seen = new Set();
  values.forEach((value) => {
    if (value === undefined || value === null || value === '') return;
    const key = String(value).trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(value);
  });
  return deduped;
}

function parseNotificationMessage(message) {
  if (!message) return { summary: '' };
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {}
  return { summary: message };
}

function buildNotificationMessage({ summary, tableName, transactionName, recordId, createdBy }) {
  const payload = {
    summary,
    tableName,
    transactionName,
    recordId,
    createdBy,
  };
  return JSON.stringify(payload);
}

function normalizeNotificationRows(rows) {
  return rows.map((row) => {
    const parsed = parseNotificationMessage(row.message);
    return {
      notification_id: row.notification_id,
      recipient_empid: row.recipient_empid,
      type: row.type,
      related_id: row.related_id,
      message: row.message,
      is_read: Boolean(row.is_read),
      created_at: row.created_at,
      created_by: row.created_by,
      company_id: row.company_id,
      summary: parsed.summary || row.message,
      tableName: parsed.tableName,
      transactionName: parsed.transactionName,
      recordId: parsed.recordId,
    };
  });
}

function resolveMatchingConfigs(row, configs) {
  const entries = Object.entries(configs || {});
  if (entries.length === 0) return [];

  const typeFields = entries
    .map(([, cfg]) => normalizeString(cfg?.transactionTypeField))
    .filter(Boolean);
  const seenFields = new Set();
  const normalizedFields = typeFields.filter((field) => {
    if (seenFields.has(field)) return false;
    seenFields.add(field);
    return true;
  });

  let matchedValue = '';
  let matchedField = '';
  for (const field of normalizedFields) {
    const value = getRowValue(row, field);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      matchedValue = String(value);
      matchedField = field;
      break;
    }
  }

  const matches = [];
  const defaults = [];
  entries.forEach(([name, cfg]) => {
    const txValue = normalizeString(cfg?.transactionTypeValue);
    if (!txValue) {
      defaults.push({ name, config: cfg });
      return;
    }
    if (!matchedValue || String(txValue) !== matchedValue) return;
    if (cfg.transactionTypeField) {
      if (normalizeString(cfg.transactionTypeField) !== matchedField) return;
      matches.push({ name, config: cfg });
      return;
    }
    matches.push({ name, config: { ...cfg, transactionTypeField: matchedField } });
  });

  if (matches.length > 0) return matches.concat(defaults);
  if (defaults.length > 0) return defaults;
  if (entries.length === 1) {
    const [name, cfg] = entries[0];
    return [{ name, config: cfg }];
  }
  return [];
}

function collectNotificationFields(configs) {
  const fields = {
    employee: new Set(),
    company: new Set(),
    department: new Set(),
    branch: new Set(),
    customer: new Set(),
    email: new Set(),
    phone: new Set(),
  };
  configs.forEach(({ config }) => {
    const add = (set, list) => {
      if (!Array.isArray(list)) return;
      list.forEach((entry) => {
        const key = normalizeString(entry);
        if (key) set.add(key);
      });
    };
    add(fields.employee, config?.notificationEmployeeFields);
    add(fields.company, config?.notificationCompanyFields);
    add(fields.department, config?.notificationDepartmentFields);
    add(fields.branch, config?.notificationBranchFields);
    add(fields.customer, config?.notificationCustomerFields);
    add(fields.email, config?.notificationEmailFields);
    add(fields.phone, config?.notificationPhoneFields);
  });
  return fields;
}

async function fetchEmploymentRecipients({
  companyIds = [],
  branchIds = [],
  departmentIds = [],
  tenantCompanyId,
  conn = pool,
}) {
  if (!companyIds.length && !branchIds.length && !departmentIds.length) return [];
  const criteria = [];
  const params = [];
  if (companyIds.length) {
    criteria.push(`employment_company_id IN (${companyIds.map(() => '?').join(', ')})`);
    params.push(...companyIds);
  }
  if (branchIds.length) {
    criteria.push(`employment_branch_id IN (${branchIds.map(() => '?').join(', ')})`);
    params.push(...branchIds);
  }
  if (departmentIds.length) {
    criteria.push(`employment_department_id IN (${departmentIds.map(() => '?').join(', ')})`);
    params.push(...departmentIds);
  }
  let where = criteria.length ? `WHERE (${criteria.join(' OR ')})` : '';
  if (tenantCompanyId) {
    where += `${where ? ' AND' : ' WHERE'} company_id = ?`;
    params.push(tenantCompanyId);
  }
  const [rows] = await conn.query(
    `SELECT employment_emp_id FROM tbl_employment ${where}`,
    params,
  );
  return rows
    .map((row) => normalizeIdentifier(row.employment_emp_id))
    .filter(Boolean);
}

async function fetchCustomerEmails({
  field,
  values,
  companyId,
  columnMetaCache,
  relations,
  conn = pool,
}) {
  if (!values.length) return [];
  const relationList = relations[field.toLowerCase()] || [];
  const emails = [];
  for (const relation of relationList) {
    if (!relation?.table || !relation?.column) continue;
    const targetTable = relation.table;
    if (!columnMetaCache.has(targetTable)) {
      const meta = await listTableColumnMeta(targetTable, companyId);
      columnMetaCache.set(targetTable, meta);
    }
    const meta = columnMetaCache.get(targetTable) || [];
    const emailColumnEntry = meta.find((col) =>
      EMAIL_COLUMN_HINTS.some((hint) => col.name.toLowerCase().includes(hint)),
    );
    if (!emailColumnEntry) continue;
    const emailColumn = emailColumnEntry.name;
    const targetIds = dedupeValues(values).map((value) => String(value));
    if (!targetIds.length) continue;
    const placeholders = targetIds.map(() => '?').join(', ');
    const params = [...targetIds];
    const filters = [`\`${relation.column}\` IN (${placeholders})`];
    if (meta.some((col) => col.name.toLowerCase() === 'company_id') && companyId) {
      filters.push('company_id = ?');
      params.push(companyId);
    }
    const [rows] = await conn.query(
      `SELECT \`${emailColumn}\` FROM \`${targetTable}\` WHERE ${filters.join(' AND ')}`,
      params,
    );
    rows.forEach((row) => {
      const email = normalizeIdentifier(row[emailColumn]);
      if (email) emails.push(email);
    });
  }
  return dedupeValues(emails);
}

async function insertNotifications({
  conn = pool,
  companyId,
  recipients,
  relatedId,
  message,
  createdBy,
}) {
  const normalizedRecipients = dedupeValues(recipients)
    .map((recipient) => normalizeIdentifier(recipient))
    .filter(Boolean);
  if (!normalizedRecipients.length) return 0;
  const values = normalizedRecipients.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];
  normalizedRecipients.forEach((recipient) => {
    params.push(
      companyId ?? null,
      recipient,
      NOTIFICATION_TYPE,
      relatedId ?? null,
      message ?? '',
      createdBy ?? null,
    );
  });
  const [result] = await conn.query(
    `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
     VALUES ${values}`,
    params,
  );
  return result?.affectedRows ?? 0;
}

function normalizeRelationMap(dbRelations, customRelations) {
  const map = {};
  const addRelation = (field, relation) => {
    if (!field || !relation) return;
    const key = field.toLowerCase();
    if (!map[key]) map[key] = [];
    map[key].push(relation);
  };
  if (Array.isArray(dbRelations)) {
    dbRelations.forEach((rel) => {
      if (!rel?.COLUMN_NAME) return;
      addRelation(rel.COLUMN_NAME, {
        table: rel.REFERENCED_TABLE_NAME,
        column: rel.REFERENCED_COLUMN_NAME,
        isArray: false,
      });
    });
  }
  if (customRelations && typeof customRelations === 'object') {
    Object.entries(customRelations).forEach(([field, relations]) => {
      if (!Array.isArray(relations)) return;
      relations.forEach((rel) => {
        if (!rel?.table || !rel?.column) return;
        addRelation(field, rel);
      });
    });
  }
  return map;
}

function collectFieldValues(row, fields, columnMetaMap, relationMap) {
  const values = {};
  fields.forEach((field) => {
    const lower = field.toLowerCase();
    const meta = columnMetaMap.get(lower);
    const relation = relationMap[lower]?.find((rel) => rel?.isArray);
    const extracted = extractValues({ row, field, columnMeta: meta });
    if (relation?.isArray && extracted.length === 1) {
      values[field] = coerceJsonValues(extracted[0]);
      return;
    }
    values[field] = extracted;
  });
  return values;
}

export async function dispatchTransactionNotifications({
  tableName,
  row,
  insertId,
  companyId,
  createdBy,
  conn = pool,
}) {
  if (!tableName || !row) return { inserted: 0, emails: 0 };
  const { config } = await getConfigsByTable(tableName, companyId);
  if (!config || Object.keys(config).length === 0) return { inserted: 0, emails: 0 };
  const matchingConfigs = resolveMatchingConfigs(row, config);
  if (!matchingConfigs.length) return { inserted: 0, emails: 0 };

  const fields = collectNotificationFields(matchingConfigs);
  const allFieldNames = new Set([
    ...fields.employee,
    ...fields.company,
    ...fields.department,
    ...fields.branch,
    ...fields.customer,
    ...fields.email,
    ...fields.phone,
  ]);
  if (allFieldNames.size === 0) return { inserted: 0, emails: 0 };

  const columnMeta = await listTableColumnMeta(tableName, companyId);
  const columnMetaMap = new Map(
    columnMeta.map((col) => [col.name.toLowerCase(), col]),
  );
  const [dbRelations, customRelationResult] = await Promise.all([
    listTableRelationships(tableName),
    listCustomRelations(tableName, companyId),
  ]);
  const relationMap = normalizeRelationMap(
    dbRelations,
    customRelationResult?.config ?? {},
  );

  const allFieldsArray = Array.from(allFieldNames);
  const fieldValues = collectFieldValues(row, allFieldsArray, columnMetaMap, relationMap);

  const employeeRecipients = new Set();
  const companyIds = [];
  const branchIds = [];
  const departmentIds = [];
  const customerIds = [];
  const emailAddresses = [];

  fields.employee.forEach((field) => {
    (fieldValues[field] || []).forEach((value) => {
      const normalized = normalizeIdentifier(value);
      if (normalized) employeeRecipients.add(normalized);
    });
  });
  fields.company.forEach((field) => {
    companyIds.push(...(fieldValues[field] || []));
  });
  fields.department.forEach((field) => {
    departmentIds.push(...(fieldValues[field] || []));
  });
  fields.branch.forEach((field) => {
    branchIds.push(...(fieldValues[field] || []));
  });
  fields.customer.forEach((field) => {
    customerIds.push(...(fieldValues[field] || []));
  });
  fields.email.forEach((field) => {
    (fieldValues[field] || []).forEach((value) => {
      const normalized = normalizeIdentifier(value);
      if (normalized) emailAddresses.push(normalized);
    });
  });

  const tenantCompanyId =
    companyId ??
    row?.company_id ??
    row?.companyId ??
    null;

  const scopedRecipients = await fetchEmploymentRecipients({
    companyIds: dedupeValues(companyIds),
    branchIds: dedupeValues(branchIds),
    departmentIds: dedupeValues(departmentIds),
    tenantCompanyId,
    conn,
  });
  scopedRecipients.forEach((recipient) => employeeRecipients.add(recipient));

  const columnMetaCache = new Map();
  for (const field of fields.customer) {
    // eslint-disable-next-line no-await-in-loop
    const customerEmails = await fetchCustomerEmails({
      field,
      values: dedupeValues(fieldValues[field] || []),
      companyId: tenantCompanyId,
      columnMetaCache,
      relations: relationMap,
      conn,
    });
    customerEmails.forEach((email) => emailAddresses.push(email));
  }

  const recipients = Array.from(employeeRecipients);
  const transactionName = matchingConfigs[0]?.name || tableName;
  const summary = `New ${transactionName} transaction`;
  const message = buildNotificationMessage({
    summary,
    tableName,
    transactionName,
    recordId: insertId,
    createdBy,
  });

  const inserted = await insertNotifications({
    conn,
    companyId: tenantCompanyId,
    recipients,
    relatedId: insertId,
    message,
    createdBy,
  });

  let emailCount = 0;
  const dedupedEmails = dedupeValues(emailAddresses);
  if (dedupedEmails.length) {
    const subject = summary;
    const body = `<p>${summary}</p>`;
    for (const email of dedupedEmails) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sendEmail(email, subject, body);
        emailCount += 1;
      } catch (err) {
        console.warn('Failed to send notification email', { email, error: err?.message });
      }
    }
  }

  return { inserted, emails: emailCount };
}

export async function listNotifications({
  empid,
  companyId,
  page = 1,
  perPage = DEFAULT_NOTIFICATION_LIMIT,
  unreadOnly = false,
  conn = pool,
}) {
  if (!empid) return { rows: [], total: 0, unreadTotal: 0 };
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safePerPage = Math.min(Math.max(Number(perPage) || DEFAULT_NOTIFICATION_LIMIT, 1), 100);
  const offset = (safePage - 1) * safePerPage;
  const params = [empid];
  let where = 'WHERE recipient_empid = ?';
  if (companyId) {
    where += ' AND company_id = ?';
    params.push(companyId);
  }
  if (unreadOnly) {
    where += ' AND is_read = 0';
  }
  const [rows] = await conn.query(
    `SELECT notification_id, recipient_empid, type, related_id, message, is_read, created_at, created_by, company_id
       FROM notifications
       ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, safePerPage, offset],
  );
  const [countRows] = await conn.query(
    `SELECT COUNT(*) AS total FROM notifications ${where}`,
    params,
  );
  const [unreadRows] = await conn.query(
    `SELECT COUNT(*) AS total FROM notifications
      WHERE recipient_empid = ?
        ${companyId ? 'AND company_id = ?' : ''}
        AND is_read = 0`,
    companyId ? [empid, companyId] : [empid],
  );
  return {
    rows: normalizeNotificationRows(rows || []),
    total: Number(countRows?.[0]?.total) || 0,
    unreadTotal: Number(unreadRows?.[0]?.total) || 0,
    page: safePage,
    per_page: safePerPage,
  };
}

export async function listNotificationSummary({
  empid,
  companyId,
  limit = 200,
  conn = pool,
}) {
  const { rows, unreadTotal } = await listNotifications({
    empid,
    companyId,
    page: 1,
    perPage: limit,
    conn,
  });
  const grouped = new Map();
  rows.forEach((row) => {
    const key = row.transactionName || row.tableName || 'Other';
    const entry = grouped.get(key) || {
      key,
      name: key,
      count: 0,
      unreadCount: 0,
      latestAt: null,
      latestNotificationId: null,
    };
    entry.count += 1;
    if (!row.is_read) entry.unreadCount += 1;
    const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (!entry.latestAt || ts > new Date(entry.latestAt).getTime()) {
      entry.latestAt = row.created_at;
      entry.latestNotificationId = row.notification_id;
    }
    grouped.set(key, entry);
  });
  const groups = Array.from(grouped.values()).sort((a, b) => {
    const aTime = a.latestAt ? new Date(a.latestAt).getTime() : 0;
    const bTime = b.latestAt ? new Date(b.latestAt).getTime() : 0;
    return bTime - aTime;
  });
  return { groups, unreadTotal };
}

export async function markNotificationsRead({
  empid,
  companyId,
  notificationIds = [],
  conn = pool,
}) {
  const ids = dedupeValues(notificationIds).map((id) => Number(id)).filter((id) =>
    Number.isFinite(id),
  );
  if (!ids.length || !empid) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const params = [...ids, empid];
  let whereCompany = '';
  if (companyId) {
    whereCompany = ' AND company_id = ?';
    params.push(companyId);
  }
  const [result] = await conn.query(
    `UPDATE notifications
        SET is_read = 1, updated_at = NOW()
      WHERE notification_id IN (${placeholders})
        AND recipient_empid = ?${whereCompany}`,
    params,
  );
  return result?.affectedRows ?? 0;
}

export function parseNotificationPayload(message) {
  return parseNotificationMessage(message);
}

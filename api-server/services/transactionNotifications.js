import { pool, listTableColumnMeta, listTableRelationships } from '../../db/index.js';
import { listCustomRelations } from './tableRelationsConfig.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { sendEmail } from './emailService.js';

const EMAIL_REGEX = /.+@.+\..+/;

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number.isFinite(Number(value)) ? String(value) : null;
  }
  return null;
}

function extractPrimitive(candidate) {
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'bigint') {
    return candidate;
  }
  if (typeof candidate === 'object') {
    const direct =
      candidate.id ??
      candidate.emp_id ??
      candidate.empid ??
      candidate.value ??
      candidate.key ??
      null;
    if (direct !== null && direct !== undefined) return direct;
    const values = Object.values(candidate);
    if (values.length === 1) return values[0];
  }
  return null;
}

function parseStructuredValue(raw, { treatAsJson = false } = {}) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (treatAsJson || trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') return Object.values(parsed);
      } catch {
        // ignore
      }
    }
    return [trimmed];
  }
  if (typeof raw === 'object') {
    return Object.values(raw);
  }
  return [raw];
}

function normalizeEmail(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str || !EMAIL_REGEX.test(str)) return null;
  return str;
}

function selectConfigByRow(configs, row) {
  if (!configs || typeof configs !== 'object') return { name: null, config: null };
  const entries = Object.entries(configs);
  if (entries.length === 0) return { name: null, config: null };
  if (entries.length === 1) {
    const [name, config] = entries[0];
    return { name, config };
  }
  const normalizedRow = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    normalizedRow[key.toLowerCase()] = value;
  });
  const matchByType = entries.find(([, cfg]) => {
    const field = typeof cfg?.transactionTypeField === 'string' ? cfg.transactionTypeField.trim() : '';
    const value = typeof cfg?.transactionTypeValue === 'string' ? cfg.transactionTypeValue.trim() : '';
    if (!field || !value) return false;
    const rowValue = normalizedRow[field.toLowerCase()];
    return rowValue !== undefined && String(rowValue).trim() === value;
  });
  if (matchByType) {
    const [name, config] = matchByType;
    return { name, config };
  }
  const defaultEntry = entries.find(([, cfg]) => {
    const field = typeof cfg?.transactionTypeField === 'string' ? cfg.transactionTypeField.trim() : '';
    const value = typeof cfg?.transactionTypeValue === 'string' ? cfg.transactionTypeValue.trim() : '';
    return !field && !value;
  });
  if (defaultEntry) {
    const [name, config] = defaultEntry;
    return { name, config };
  }
  const [name, config] = entries[0];
  return { name, config };
}

function resolveColumnMeta(columnMeta, name) {
  if (!Array.isArray(columnMeta) || !name) return null;
  const lower = name.toLowerCase();
  return columnMeta.find((entry) => entry?.name?.toLowerCase() === lower) || null;
}

function isJsonColumn(columnMeta, relation = null) {
  if (relation?.isArray) return true;
  const dataType = columnMeta?.dataType || columnMeta?.type || '';
  const columnType = columnMeta?.columnType || '';
  return (
    String(dataType).toLowerCase() === 'json' ||
    String(columnType).toLowerCase().includes('json')
  );
}

async function buildRelationMap(tableName, companyId) {
  const relations = new Map();
  try {
    const [dbRelations, custom] = await Promise.all([
      listTableRelationships(tableName),
      listCustomRelations(tableName, companyId),
    ]);
    if (Array.isArray(dbRelations)) {
      dbRelations.forEach((rel) => {
        if (!rel?.COLUMN_NAME) return;
        relations.set(rel.COLUMN_NAME.toLowerCase(), {
          table: rel.REFERENCED_TABLE_NAME,
          column: rel.REFERENCED_COLUMN_NAME,
        });
      });
    }
    const customConfig = custom?.config || {};
    const columnEntries = customConfig[tableName] || customConfig;
    if (columnEntries && typeof columnEntries === 'object') {
      Object.entries(columnEntries).forEach(([column, rels]) => {
        if (!Array.isArray(rels) || rels.length === 0) return;
        const rel = rels[0];
        if (!rel?.table || !rel?.column) return;
        relations.set(column.toLowerCase(), {
          table: rel.table,
          column: rel.column,
          isArray: Boolean(rel.isArray),
        });
      });
    }
  } catch (err) {
    console.warn('Failed to load table relations for notifications', {
      tableName,
      error: err,
    });
  }
  return relations;
}

async function listEmployeesByScope({ companyIds = [], departmentIds = [], branchIds = [] }) {
  const recipients = new Set();
  const runQuery = async (column, ids) => {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(', ');
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT employment_emp_id AS empid FROM tbl_employment WHERE ${column} IN (${placeholders})`,
        ids,
      );
      rows.forEach((row) => {
        const normalized = normalizeId(row.empid);
        if (normalized) recipients.add(normalized);
      });
    } catch (err) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  };
  await runQuery('employment_company_id', companyIds);
  await runQuery('employment_department_id', departmentIds);
  await runQuery('employment_branch_id', branchIds);
  return recipients;
}

async function resolveEmailColumn(tableName) {
  try {
    const meta = await listTableColumnMeta(tableName);
    if (!Array.isArray(meta) || meta.length === 0) return null;
    const exact = meta.find((col) => col?.name?.toLowerCase() === 'email');
    if (exact) return exact.name;
    const candidate = meta.find((col) => col?.name?.toLowerCase().includes('email'));
    return candidate?.name || null;
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return null;
    throw err;
  }
}

async function resolveCustomerEmails({
  tableName,
  idColumn,
  customerIds,
  companyId,
}) {
  if (!tableName || !idColumn || customerIds.length === 0) return [];
  const emailColumn = await resolveEmailColumn(tableName);
  if (!emailColumn) return [];
  const meta = await listTableColumnMeta(tableName);
  const companyColumn = meta.find((col) => col?.name?.toLowerCase() === 'company_id');
  const placeholders = customerIds.map(() => '?').join(', ');
  const params = [...customerIds];
  let sql = `SELECT \`${emailColumn}\` AS email FROM \`${tableName}\` WHERE \`${idColumn}\` IN (${placeholders})`;
  if (companyColumn && companyId) {
    sql += ` AND \`${companyColumn.name}\` = ?`;
    params.push(companyId);
  }
  try {
    const [rows] = await pool.query(sql, params);
    return rows.map((row) => normalizeEmail(row.email)).filter(Boolean);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function insertNotifications({ companyId, recipients, relatedId, message, createdBy }) {
  const targetRecipients = Array.from(recipients || []).filter(Boolean);
  if (!targetRecipients.length) return 0;
  const values = targetRecipients.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];
  targetRecipients.forEach((recipient) => {
    params.push(
      companyId ?? null,
      recipient,
      'request',
      relatedId ?? null,
      message ?? '',
      createdBy ?? null,
    );
  });
  const [result] = await pool.query(
    `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)\n     VALUES ${values}`,
    params,
  );
  return result?.affectedRows ?? 0;
}

export async function notifyTransactionChange(
  { tableName, recordId, row, companyId, createdBy, action = 'created' } = {},
) {
  if (!tableName || !row) return;
  try {
    const { config } = await getConfigsByTable(tableName, companyId);
    const { name: configName, config: formConfig } = selectConfigByRow(config, row);
    if (!formConfig) return;
    const notificationFields = {
      company: Array.isArray(formConfig.notificationCompanyFields)
        ? formConfig.notificationCompanyFields
        : [],
      department: Array.isArray(formConfig.notificationDepartmentFields)
        ? formConfig.notificationDepartmentFields
        : [],
      branch: Array.isArray(formConfig.notificationBranchFields)
        ? formConfig.notificationBranchFields
        : [],
      employee: Array.isArray(formConfig.notificationEmployeeFields)
        ? formConfig.notificationEmployeeFields
        : [],
      customer: Array.isArray(formConfig.notificationCustomerFields)
        ? formConfig.notificationCustomerFields
        : [],
      email: Array.isArray(formConfig.notificationEmailFields)
        ? formConfig.notificationEmailFields
        : [],
    };
    const hasNotificationConfig = Object.values(notificationFields).some(
      (list) => Array.isArray(list) && list.length > 0,
    );
    if (!hasNotificationConfig) return;

    const columnMeta = await listTableColumnMeta(tableName);
    const relationMap = await buildRelationMap(tableName, companyId);
    const rowValues = {};
    Object.entries(row).forEach(([key, value]) => {
      rowValues[key.toLowerCase()] = value;
    });

    const employeeIds = new Set();
    const companyIds = new Set();
    const departmentIds = new Set();
    const branchIds = new Set();
    const customerIds = new Set();
    const emailRecipients = new Set();

    const collectValues = (field) => {
      const value = rowValues[field.toLowerCase()];
      if (value === undefined) return [];
      const relation = relationMap.get(field.toLowerCase());
      const meta = resolveColumnMeta(columnMeta, field);
      const treatAsJson = isJsonColumn(meta, relation);
      return parseStructuredValue(value, { treatAsJson });
    };

    const collectIds = (fields, collector, normalize) => {
      fields.forEach((field) => {
        const values = collectValues(field);
        values.forEach((val) => {
          const extracted = extractPrimitive(val);
          const normalized = normalize(extracted);
          if (normalized) collector.add(normalized);
        });
      });
    };

    collectIds(notificationFields.employee, employeeIds, normalizeId);
    collectIds(notificationFields.company, companyIds, (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    });
    collectIds(notificationFields.department, departmentIds, (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    });
    collectIds(notificationFields.branch, branchIds, (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    });
    collectIds(notificationFields.customer, customerIds, (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    });

    notificationFields.email.forEach((field) => {
      const values = collectValues(field);
      values.forEach((val) => {
        const extracted = extractPrimitive(val);
        const normalized = normalizeEmail(extracted);
        if (normalized) emailRecipients.add(normalized);
      });
    });

    const scopedEmployees = await listEmployeesByScope({
      companyIds: Array.from(companyIds),
      departmentIds: Array.from(departmentIds),
      branchIds: Array.from(branchIds),
    });
    scopedEmployees.forEach((empId) => employeeIds.add(empId));

    if (customerIds.size > 0) {
      const customerField = notificationFields.customer.find((field) => {
        const relation = relationMap.get(field.toLowerCase());
        return relation?.table && relation?.column;
      });
      if (customerField) {
        const relation = relationMap.get(customerField.toLowerCase());
        const resolvedEmails = await resolveCustomerEmails({
          tableName: relation.table,
          idColumn: relation.column,
          customerIds: Array.from(customerIds),
          companyId,
        });
        resolvedEmails.forEach((email) => emailRecipients.add(email));
      }
    }

    const transactionLabel =
      formConfig.moduleLabel || configName || tableName;
    const summary =
      action === 'updated'
        ? `Updated ${transactionLabel} transaction`
        : `New ${transactionLabel} transaction`;
    const numericRecordId = Number(recordId);
    const relatedId = Number.isFinite(numericRecordId) ? numericRecordId : 0;
    const message = JSON.stringify({
      summary,
      transactionName: configName || transactionLabel,
      tableName,
      recordId: recordId ?? null,
      action,
    });

    if (employeeIds.size > 0) {
      await insertNotifications({
        companyId,
        recipients: employeeIds,
        relatedId,
        message,
        createdBy,
      });
    }

    if (emailRecipients.size > 0) {
      const subject = summary;
      const html = `<p>${summary}</p><p>Reference: ${tableName} #${recordId ?? ''}</p>`;
      for (const recipient of emailRecipients) {
        // eslint-disable-next-line no-await-in-loop
        await sendEmail(recipient, subject, html);
      }
    }
  } catch (err) {
    console.error('Failed to notify transaction change', {
      tableName,
      recordId,
      error: err,
    });
  }
}

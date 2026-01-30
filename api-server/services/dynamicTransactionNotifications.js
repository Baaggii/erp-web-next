import { pool, getTableRowById, listTableRelationships, getTableColumnsSafe, getTenantTableFlags } from '../../db/index.js';
import { listCustomRelations } from './tableRelationsConfig.js';
import { getDisplayFields } from './displayFieldConfig.js';
import { sendEmail } from './emailService.js';
import { GLOBAL_COMPANY_ID } from '../../config/0/constants.js';

const SUPPORTED_ROLES = new Set(['employee', 'company', 'department', 'branch', 'customer']);
const JOB_QUEUE = [];
let processing = false;
let notificationIo = null;
let jobCounter = 0;

function normalizeRole(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  values.forEach((value) => {
    const normalized = normalizeId(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function resolveColumnName(columns, target) {
  if (!Array.isArray(columns) || !target) return null;
  const targetLower = String(target).toLowerCase();
  const exact = columns.find((col) => String(col).toLowerCase() === targetLower);
  if (exact) return exact;
  const sanitizedTarget = targetLower.replace(/_/g, '');
  return (
    columns.find((col) => String(col).toLowerCase().replace(/_/g, '') === sanitizedTarget) ||
    null
  );
}

function getObjectFieldValue(obj, field) {
  if (!obj || typeof obj !== 'object' || !field) return null;
  if (Object.prototype.hasOwnProperty.call(obj, field)) return obj[field];
  const targetLower = String(field).toLowerCase();
  const match = Object.keys(obj).find(
    (key) => String(key).toLowerCase() === targetLower,
  );
  return match ? obj[match] : null;
}

function getRowFieldValue(row, field) {
  if (!row || !field) return null;
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  const lower = String(field).toLowerCase();
  const match = Object.keys(row).find((key) => String(key).toLowerCase() === lower);
  return match ? row[match] : null;
}

function parseJsonValue(raw) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return raw;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function extractReferenceValues(rawValue, relation) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return [];
  const parsed = parseJsonValue(rawValue);
  const idField = relation?.idField || relation?.column || null;

  const extractItem = (item) => {
    if (item === null || item === undefined || item === '') return null;
    if (Array.isArray(item)) {
      return item.map(extractItem).filter(Boolean);
    }
    if (typeof item === 'object') {
      const value =
        getObjectFieldValue(item, idField) ??
        getObjectFieldValue(item, relation?.column) ??
        getObjectFieldValue(item, 'id');
      return value ?? null;
    }
    return item;
  };

  let values = [];
  if (Array.isArray(parsed)) {
    values = parsed.flatMap((item) => extractItem(item));
  } else if (typeof parsed === 'object') {
    const extracted = extractItem(parsed);
    values = Array.isArray(extracted) ? extracted : [extracted];
  } else {
    values = [parsed];
  }

  return normalizeIdList(values);
}

async function fetchReferenceRows({ table, idField, ids, companyId }) {
  const normalizedIds = normalizeIdList(ids);
  if (!table || !idField || normalizedIds.length === 0) return [];
  const columns = await getTableColumnsSafe(table);
  const resolvedIdField = resolveColumnName(columns, idField);
  if (!resolvedIdField) return [];

  const hasCompanyId = columns.some(
    (col) => String(col).toLowerCase() === 'company_id',
  );
  const shouldFilterCompany =
    hasCompanyId &&
    companyId !== null &&
    companyId !== undefined &&
    resolvedIdField.toLowerCase() !== 'company_id';
  const flags = shouldFilterCompany ? await getTenantTableFlags(table) : null;

  const placeholders = normalizedIds.map(() => '?').join(', ');
  let sql = `SELECT * FROM \`${table}\` WHERE \`${resolvedIdField}\` IN (${placeholders})`;
  const params = [...normalizedIds];

  if (shouldFilterCompany) {
    if (flags?.isShared) {
      sql += ' AND `company_id` IN (?, ?)';
      params.push(GLOBAL_COMPANY_ID, companyId);
    } else {
      sql += ' AND `company_id` = ?';
      params.push(companyId);
    }
  }

  const [rows] = await pool.query(sql, params);
  return Array.isArray(rows) ? rows : [];
}

function buildSummaryText(row, fields, fallbackId) {
  if (!row || !Array.isArray(fields) || fields.length === 0) {
    return fallbackId ? String(fallbackId) : '';
  }
  const parts = fields
    .map((field) => {
      const value = getRowFieldValue(row, field);
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      return text ? text : null;
    })
    .filter(Boolean);
  if (parts.length === 0 && fallbackId) return String(fallbackId);
  return parts.join(' ');
}

function buildMessagePayload({
  tableName,
  recordId,
  action,
  referenceTable,
  referenceId,
  referenceLabel,
  role,
}) {
  const transactionName = tableName || 'transaction';
  const summary = referenceLabel || '';
  return {
    kind: 'dynamic-transaction',
    transactionTable: tableName,
    transactionName,
    transactionId: recordId,
    action,
    referenceTable,
    referenceId,
    summary,
    notificationRole: role,
    text: summary ? `${transactionName}: ${summary}` : transactionName,
  };
}

function collectContactValues(row, fields) {
  if (!row || !Array.isArray(fields) || fields.length === 0) return [];
  const values = [];
  fields.forEach((field) => {
    const raw = getRowFieldValue(row, field);
    if (raw === null || raw === undefined) return;
    if (Array.isArray(raw)) {
      raw.forEach((value) => values.push(value));
      return;
    }
    const parsed = parseJsonValue(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach((value) => values.push(value));
      return;
    }
    values.push(parsed);
  });
  return normalizeIdList(values);
}

async function resolveCompanyRecipients(companyId) {
  const normalizedCompany = normalizeId(companyId);
  if (!normalizedCompany) return [];
  const [rows] = await pool.query(
    'SELECT empid FROM users WHERE company_id = ? AND empid IS NOT NULL',
    [normalizedCompany],
  );
  return normalizeIdList(rows.map((row) => row.empid));
}

async function resolveDepartmentRecipients(departmentId, companyId) {
  const normalizedDepartment = normalizeId(departmentId);
  if (!normalizedDepartment) return [];
  const params = [normalizedDepartment];
  let sql =
    'SELECT employment_emp_id FROM tbl_employment WHERE employment_department_id = ?';
  if (companyId !== null && companyId !== undefined && companyId !== '') {
    sql += ' AND company_id = ?';
    params.push(companyId);
  }
  const [rows] = await pool.query(sql, params);
  return normalizeIdList(rows.map((row) => row.employment_emp_id));
}

async function resolveBranchRecipients(branchId, companyId) {
  const normalizedBranch = normalizeId(branchId);
  if (!normalizedBranch) return [];
  const params = [normalizedBranch];
  let sql =
    'SELECT employment_emp_id FROM tbl_employment WHERE employment_branch_id = ?';
  if (companyId !== null && companyId !== undefined && companyId !== '') {
    sql += ' AND company_id = ?';
    params.push(companyId);
  }
  const [rows] = await pool.query(sql, params);
  return normalizeIdList(rows.map((row) => row.employment_emp_id));
}

async function insertNotifications(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  const values = entries
    .map(() => '(?, ?, ?, ?, ?, ?)')
    .join(', ');
  const params = [];
  entries.forEach((entry) => {
    params.push(
      entry.companyId ?? null,
      entry.recipientEmpId,
      entry.type ?? 'transaction',
      entry.relatedId ?? null,
      entry.message ?? '',
      entry.createdBy ?? null,
    );
  });
  await pool.query(
    `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
     VALUES ${values}`,
    params,
  );
}

async function sendPhoneMessage(to, body) {
  if (!to) return;
  try {
    console.log('SMS placeholder:', { to, body });
  } catch (err) {
    console.error('Failed to send SMS placeholder', err);
  }
}

async function loadRelationMap(tableName, companyId) {
  const map = new Map();
  const [dbRelations, custom] = await Promise.all([
    listTableRelationships(tableName),
    listCustomRelations(tableName, companyId),
  ]);

  if (Array.isArray(dbRelations)) {
    dbRelations.forEach((rel) => {
      if (!rel?.COLUMN_NAME || !rel?.REFERENCED_TABLE_NAME) return;
      const key = String(rel.COLUMN_NAME).toLowerCase();
      const list = map.get(key) ?? [];
      list.push({
        table: rel.REFERENCED_TABLE_NAME,
        column: rel.REFERENCED_COLUMN_NAME,
        idField: rel.REFERENCED_COLUMN_NAME,
        source: 'database',
      });
      map.set(key, list);
    });
  }

  const customConfig = custom?.config || {};
  Object.entries(customConfig).forEach(([column, relations]) => {
    const key = String(column).toLowerCase();
    const list = map.get(key) ?? [];
    if (Array.isArray(relations)) {
      relations.forEach((rel) => {
        if (!rel?.table || !rel?.column) return;
        list.push({
          table: rel.table,
          column: rel.column,
          idField: rel.idField || rel.column,
          isArray: rel.isArray === true,
          filterColumn: rel.filterColumn,
          filterValue: rel.filterValue,
          source: 'custom',
        });
      });
    }
    if (list.length > 0) map.set(key, list);
  });

  return map;
}

async function processNotificationJob(job) {
  if (!job?.tableName || !job?.recordId) return;
  const row = await getTableRowById(job.tableName, job.recordId, {
    defaultCompanyId: job.companyId,
  });
  if (!row) return;

  const relationMap = await loadRelationMap(job.tableName, job.companyId);
  if (relationMap.size === 0) return;

  const notificationEntries = [];
  const socketTargets = [];
  const emailQueue = [];
  const phoneQueue = [];

  for (const [columnKey, relations] of relationMap.entries()) {
    const rawValue = getRowFieldValue(row, columnKey);
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;
    for (const relation of relations) {
      const referenceIds = extractReferenceValues(rawValue, relation);
      if (referenceIds.length === 0) continue;

      const { config } = await getDisplayFields(relation.table, job.companyId, {
        filterColumn: relation.filterColumn,
        filterValue: relation.filterValue,
        idField: relation.idField || relation.column,
      });
      const role = normalizeRole(config?.notificationRole);
      if (!role || !SUPPORTED_ROLES.has(role)) continue;

      const dashboardFields = Array.isArray(config.notificationDashboardFields)
        ? config.notificationDashboardFields
        : [];
      const emailFields = Array.isArray(config.notificationEmailFields)
        ? config.notificationEmailFields
        : [];
      const phoneFields = Array.isArray(config.notificationPhoneFields)
        ? config.notificationPhoneFields
        : [];
      const referenceIdField =
        config.idField || relation.idField || relation.column || 'id';

      const referenceRows = await fetchReferenceRows({
        table: relation.table,
        idField: referenceIdField,
        ids: referenceIds,
        companyId: job.companyId,
      });
      const referenceRowMap = new Map();
      referenceRows.forEach((refRow) => {
        const idValue = getRowFieldValue(refRow, referenceIdField);
        const normalizedId = normalizeId(idValue);
        if (normalizedId) referenceRowMap.set(normalizedId, refRow);
      });

      for (const referenceId of referenceIds) {
        const referenceRow = referenceRowMap.get(referenceId) || null;
        const summaryText = buildSummaryText(
          referenceRow,
          dashboardFields,
          referenceId,
        );
        const messagePayload = buildMessagePayload({
          tableName: job.tableName,
          recordId: job.recordId,
          action: job.action,
          referenceTable: relation.table,
          referenceId,
          referenceLabel: summaryText,
          role,
        });

        let recipients = [];
        if (role === 'employee') {
          recipients = normalizeIdList([referenceId]);
          socketTargets.push({ scope: 'emp', key: referenceId, payload: messagePayload });
        } else if (role === 'company') {
          const targetCompany = normalizeId(referenceId) || normalizeId(job.companyId);
          recipients = await resolveCompanyRecipients(targetCompany);
          if (targetCompany) {
            socketTargets.push({ scope: 'company', key: targetCompany, payload: messagePayload });
          }
        } else if (role === 'department') {
          recipients = await resolveDepartmentRecipients(referenceId, job.companyId);
          socketTargets.push({ scope: 'department', key: referenceId, payload: messagePayload });
        } else if (role === 'branch') {
          recipients = await resolveBranchRecipients(referenceId, job.companyId);
          socketTargets.push({ scope: 'branch', key: referenceId, payload: messagePayload });
        }

        if (recipients.length > 0) {
          recipients.forEach((recipient) => {
            notificationEntries.push({
              companyId: job.companyId ?? null,
              recipientEmpId: recipient,
              type: 'request',
              relatedId: job.recordId,
              message: JSON.stringify(messagePayload),
              createdBy: job.changedBy ?? null,
            });
            socketTargets.push({ scope: 'emp', key: recipient, payload: messagePayload });
          });
        }

        const emails = collectContactValues(referenceRow, emailFields);
        const phones = collectContactValues(referenceRow, phoneFields);
        if (emails.length > 0) {
          emails.forEach((email) => {
            emailQueue.push({
              to: email,
              subject: `${job.tableName} ${job.action === 'update' ? 'updated' : 'created'}`,
              body: messagePayload.text,
            });
          });
        }
        if (phones.length > 0) {
          phones.forEach((phone) => {
            phoneQueue.push({
              to: phone,
              body: messagePayload.text,
            });
          });
        }
      }
    }
  }

  if (notificationEntries.length > 0) {
    await insertNotifications(notificationEntries);
  }

  if (notificationIo && socketTargets.length > 0) {
    const emitted = new Set();
    socketTargets.forEach((target) => {
      if (!target?.key) return;
      const room = `${target.scope}:${target.key}`;
      if (emitted.has(room)) return;
      emitted.add(room);
      notificationIo.to(room).emit('notification:new', target.payload);
    });
  }

  if (emailQueue.length > 0) {
    for (const email of emailQueue) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sendEmail(email.to, email.subject, email.body);
      } catch (err) {
        console.error('Failed to send notification email', err);
      }
    }
  }

  if (phoneQueue.length > 0) {
    for (const phone of phoneQueue) {
      // eslint-disable-next-line no-await-in-loop
      await sendPhoneMessage(phone.to, phone.body);
    }
  }
}

async function runQueue() {
  if (processing) return;
  processing = true;
  try {
    while (JOB_QUEUE.length > 0) {
      const job = JOB_QUEUE.shift();
      if (!job) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await processNotificationJob(job);
      } catch (err) {
        console.error('Dynamic transaction notification failed', err);
      }
    }
  } finally {
    processing = false;
  }
}

export function setNotificationIo(io) {
  notificationIo = io;
}

export function enqueueDynamicTransactionNotificationJob(payload) {
  if (!payload?.tableName || !payload?.recordId) return null;
  const job = {
    id: `${Date.now()}-${jobCounter++}`,
    tableName: payload.tableName,
    recordId: payload.recordId,
    action: payload.action || 'create',
    companyId: payload.companyId ?? null,
    changedBy: payload.changedBy ?? null,
  };
  JOB_QUEUE.push(job);
  setImmediate(() => {
    runQueue().catch((err) => console.error('Notification queue error', err));
  });
  return job.id;
}

import { pool, getPrimaryKeyColumns } from '../../db/index.js';
import { listCustomRelations } from './tableRelationsConfig.js';
import { getAllDisplayFields } from './displayFieldConfig.js';
import { sendEmail } from './emailService.js';

const SUPPORTED_ROLES = new Set([
  'employee',
  'company',
  'department',
  'branch',
  'customer',
]);

let ioInstance = null;
let queue = [];
let running = false;

export function setTransactionNotificationSocket(io) {
  ioInstance = io || null;
}

export function enqueueTransactionNotificationJob(job) {
  if (!job || !job.tableName || !job.recordId) return;
  queue.push({ ...job });
  scheduleRun();
}

function scheduleRun() {
  if (running) return;
  setImmediate(runQueue);
}

async function runQueue() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const job = queue.shift();
    try {
      // eslint-disable-next-line no-await-in-loop
      await processJob(job);
    } catch (err) {
      console.error('Transaction notification job failed', err);
    }
  }
  running = false;
}

function normalizeString(value) {
  if (value === undefined || value === null) return '';
  const trimmed = String(value).trim();
  return trimmed;
}

function normalizeEmpId(empid) {
  const trimmed = normalizeString(empid);
  return trimmed ? trimmed.toUpperCase() : null;
}

function parseCompositeRowId(value, expectedLength) {
  if (!value) return [];
  if (Array.isArray(value)) return value.slice(0, expectedLength);
  const raw = String(value);
  const parts = raw.split('-');
  if (expectedLength && parts.length >= expectedLength) {
    return parts.slice(0, expectedLength);
  }
  return [raw];
}

function getRowValue(row, column) {
  if (!row || !column) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, column)) return row[column];
  const lower = column.toLowerCase();
  const matchKey = Object.keys(row).find((key) => key.toLowerCase() === lower);
  return matchKey ? row[matchKey] : undefined;
}

function parseReferenceValues(raw) {
  if (raw === undefined || raw === null) return [];
  const values = [];
  const pushValue = (val) => {
    if (val === undefined || val === null) return;
    if (Array.isArray(val)) {
      val.forEach(pushValue);
      return;
    }
    if (val && typeof val === 'object') {
      if (Object.prototype.hasOwnProperty.call(val, 'value')) {
        pushValue(val.value);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(val, 'id')) {
        pushValue(val.id);
        return;
      }
    }
    const str = normalizeString(val);
    if (!str) return;
    values.push(str);
  };

  if (Array.isArray(raw)) {
    raw.forEach(pushValue);
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        parsed.forEach(pushValue);
      } else {
        pushValue(parsed);
      }
    } catch {
      pushValue(trimmed);
    }
  } else {
    pushValue(raw);
  }

  return Array.from(new Set(values));
}

function normalizeContactValues(values) {
  const normalized = [];
  parseReferenceValues(values).forEach((val) => {
    const trimmed = normalizeString(val);
    if (trimmed) normalized.push(trimmed);
  });
  return normalized;
}

function buildSummary(row, fields, fallback) {
  if (!row) return fallback;
  const parts = fields
    .map((field) => {
      const value = getRowValue(row, field);
      if (value === undefined || value === null) return null;
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return value.map((v) => normalizeString(v)).filter(Boolean).join(' ');
        }
        if (Object.prototype.hasOwnProperty.call(value, 'label')) {
          return normalizeString(value.label);
        }
        if (Object.prototype.hasOwnProperty.call(value, 'value')) {
          return normalizeString(value.value);
        }
      }
      return normalizeString(value);
    })
    .filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts.join(' ').trim() || fallback;
}

function selectDisplayConfig(entries, relation) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const tableEntries = entries.filter((entry) => entry.table === relation.table);
  if (tableEntries.length === 0) return null;
  const idMatches = relation.idField
    ? tableEntries.filter((entry) => entry.idField === relation.idField)
    : tableEntries;
  if (idMatches.length === 0) return null;
  const filterColumn = relation.filterColumn ? normalizeString(relation.filterColumn) : '';
  const filterValue =
    relation.filterValue === undefined || relation.filterValue === null
      ? ''
      : normalizeString(relation.filterValue);
  if (filterColumn && filterValue) {
    const exact = idMatches.find(
      (entry) =>
        normalizeString(entry.filterColumn) === filterColumn &&
        normalizeString(entry.filterValue ?? '') === filterValue,
    );
    if (exact) return exact;
  }
  const noFilter = idMatches.find((entry) => !entry.filterColumn && !entry.filterValue);
  return noFilter || idMatches[0] || null;
}

async function fetchRow(tableName, recordId) {
  const pkCols = await getPrimaryKeyColumns(tableName);
  if (!pkCols.length) return null;
  const params =
    pkCols.length === 1 ? [recordId] : parseCompositeRowId(recordId, pkCols.length);
  const where = pkCols.map((col) => `\`${col}\` = ?`).join(' AND ');
  const [rows] = await pool.query(
    `SELECT * FROM \`${tableName}\` WHERE ${where} LIMIT 1`,
    params,
  );
  return rows?.[0] ?? null;
}

async function fetchModuleLabel(tableName, companyId) {
  if (!tableName || !tableName.startsWith('transactions_')) return tableName;
  const moduleKey = tableName.replace(/^transactions_/, '');
  try {
    const [rows] = await pool.query(
      `SELECT label FROM modules WHERE module_key = ? AND (company_id = ? OR company_id = 0)
       ORDER BY company_id DESC
       LIMIT 1`,
      [moduleKey, companyId ?? 0],
    );
    const label = rows?.[0]?.label;
    return label || tableName;
  } catch {
    return tableName;
  }
}

async function fetchEmployeeIdsForCompany(companyId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT employment_emp_id AS empid
       FROM tbl_employment
      WHERE (company_id = ? OR employment_company_id = ?)` ,
    [companyId ?? null, companyId ?? null],
  );
  return rows.map((row) => normalizeEmpId(row.empid)).filter(Boolean);
}

async function fetchEmployeeIdsForDepartment(companyId, departmentId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT employment_emp_id AS empid
       FROM tbl_employment
      WHERE employment_department_id = ?
        AND (company_id = ? OR employment_company_id = ?)`,
    [departmentId, companyId ?? null, companyId ?? null],
  );
  return rows.map((row) => normalizeEmpId(row.empid)).filter(Boolean);
}

async function fetchEmployeeIdsForBranch(companyId, branchId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT employment_emp_id AS empid
       FROM tbl_employment
      WHERE employment_branch_id = ?
        AND (company_id = ? OR employment_company_id = ?)`,
    [branchId, companyId ?? null, companyId ?? null],
  );
  return rows.map((row) => normalizeEmpId(row.empid)).filter(Boolean);
}

async function sendPhoneMessages(phoneNumbers, message) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return;
  try {
    console.warn('SMS delivery not configured', {
      recipients: phoneNumbers,
      message,
    });
  } catch (err) {
    console.error('Failed to emit SMS placeholder', err);
  }
}

async function processJob(job) {
  if (!job.tableName || !job.recordId) return;
  if (!job.tableName.startsWith('transactions_')) return;
  const row = await fetchRow(job.tableName, job.recordId);
  if (!row) return;

  const [{ config: relations }, { config: displayConfigs }] = await Promise.all([
    listCustomRelations(job.tableName, job.companyId ?? 0),
    getAllDisplayFields(job.companyId ?? 0),
  ]);

  if (!relations || typeof relations !== 'object') return;
  const displayEntries = Array.isArray(displayConfigs) ? displayConfigs : [];
  const transactionName = await fetchModuleLabel(job.tableName, job.companyId);
  const createdBy = normalizeEmpId(job.changedBy ?? row?.created_by ?? null);
  const notifications = [];
  const recipientsByRoom = new Map();

  const cache = {
    company: null,
    departments: new Map(),
    branches: new Map(),
  };

  const ensureRoom = (room) => {
    if (!room) return;
    if (!recipientsByRoom.has(room)) recipientsByRoom.set(room, true);
  };

  for (const [column, relList] of Object.entries(relations)) {
    const relationsForColumn = Array.isArray(relList) ? relList : [relList];
    for (const relation of relationsForColumn) {
      if (!relation?.table || !relation?.column) continue;
      const displayConfig = selectDisplayConfig(displayEntries, relation);
      if (!displayConfig) continue;
      const role = normalizeString(displayConfig.notificationRole).toLowerCase();
      if (!SUPPORTED_ROLES.has(role)) continue;

      const rawValue = getRowValue(row, relation.column || column);
      const referenceIds = parseReferenceValues(rawValue);
      if (referenceIds.length === 0) continue;

      const dashboardFields = Array.isArray(displayConfig.notificationDashboardFields)
        ? displayConfig.notificationDashboardFields
        : [];
      const emailFields = Array.isArray(displayConfig.notificationEmailFields)
        ? displayConfig.notificationEmailFields
        : [];
      const phoneFields = Array.isArray(displayConfig.notificationPhoneFields)
        ? displayConfig.notificationPhoneFields
        : [];

      const idField = relation.idField || displayConfig.idField;
      if (!idField) continue;

      for (const refId of referenceIds) {
        // eslint-disable-next-line no-await-in-loop
        const [refRows] = await pool.query(
          `SELECT * FROM \`${relation.table}\` WHERE \`${idField}\` = ? LIMIT 1`,
          [refId],
        );
        const refRow = refRows?.[0] ?? null;
        const summary = buildSummary(refRow, dashboardFields, normalizeString(refId));
        const emailTargets = emailFields
          .flatMap((field) => normalizeContactValues(getRowValue(refRow, field)))
          .filter(Boolean);
        const phoneTargets = phoneFields
          .flatMap((field) => normalizeContactValues(getRowValue(refRow, field)))
          .filter(Boolean);

        let recipientEmpIds = [];
        if (role === 'employee') {
          const empId = normalizeEmpId(refId);
          if (empId) recipientEmpIds = [empId];
          ensureRoom(empId ? `emp:${empId}` : null);
        } else if (role === 'company') {
          if (!cache.company) {
            // eslint-disable-next-line no-await-in-loop
            cache.company = await fetchEmployeeIdsForCompany(job.companyId);
          }
          recipientEmpIds = cache.company;
          ensureRoom(job.companyId ? `company:${job.companyId}` : null);
        } else if (role === 'department') {
          const departmentKey = normalizeString(refId);
          if (!cache.departments.has(departmentKey)) {
            // eslint-disable-next-line no-await-in-loop
            cache.departments.set(
              departmentKey,
              await fetchEmployeeIdsForDepartment(job.companyId, departmentKey),
            );
          }
          recipientEmpIds = cache.departments.get(departmentKey) || [];
          ensureRoom(departmentKey ? `department:${departmentKey}` : null);
        } else if (role === 'branch') {
          const branchKey = normalizeString(refId);
          if (!cache.branches.has(branchKey)) {
            // eslint-disable-next-line no-await-in-loop
            cache.branches.set(
              branchKey,
              await fetchEmployeeIdsForBranch(job.companyId, branchKey),
            );
          }
          recipientEmpIds = cache.branches.get(branchKey) || [];
          ensureRoom(branchKey ? `branch:${branchKey}` : null);
        }

        const payload = {
          summary,
          transactionName,
          tableName: job.tableName,
          recordId: String(job.recordId),
          role,
          referenceTable: relation.table,
          referenceId: normalizeString(refId),
        };

        if (recipientEmpIds.length > 0) {
          recipientEmpIds
            .map((emp) => normalizeEmpId(emp))
            .filter(Boolean)
            .forEach((emp) => {
              notifications.push({
                recipientEmpId: emp,
                companyId: job.companyId ?? null,
                relatedId: job.recordId,
                createdBy,
                message: JSON.stringify(payload),
              });
            });
        }

        if (emailTargets.length > 0) {
          const subject = `New ${transactionName} notification`;
          const body = `${summary}`;
          for (const target of emailTargets) {
            // eslint-disable-next-line no-await-in-loop
            await sendEmail(target, subject, body).catch((err) => {
              console.error('Failed to send notification email', err);
            });
          }
        }

        if (phoneTargets.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await sendPhoneMessages(phoneTargets, summary);
        }
      }
    }
  }

  if (notifications.length > 0) {
    const values = notifications.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = [];
    notifications.forEach((note) => {
      params.push(
        note.companyId,
        note.recipientEmpId,
        'transaction',
        note.relatedId,
        note.message,
        note.createdBy,
      );
    });
    await pool.query(
      `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
       VALUES ${values}`,
      params,
    );
  }

  if (ioInstance && recipientsByRoom.size > 0) {
    const payload = {
      tableName: job.tableName,
      recordId: String(job.recordId),
    };
    recipientsByRoom.forEach((_, room) => {
      try {
        ioInstance.to(room).emit('notification:new', payload);
      } catch (err) {
        console.error('Failed to emit notification socket event', err);
      }
    });
  }
}

import { pool, listTableRelationships, listTableColumns, getTableRowById } from '../../db/index.js';
import { getAllDisplayFields } from './displayFieldConfig.js';
import { listCustomRelations } from './tableRelationsConfig.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { notifyUser } from './notificationService.js';

const NOTIFICATION_ROLE_SET = new Set([
  'employee',
  'company',
  'department',
  'branch',
  'customer',
]);

const queue = [];
let processing = false;
let ioEmitter = null;

export function setNotificationEmitter(io) {
  ioEmitter = io || null;
}

export function enqueueTransactionNotification(job = {}) {
  const tableName = typeof job.tableName === 'string' ? job.tableName : '';
  if (!tableName || !tableName.startsWith('transactions_')) return;
  if (!job.recordId || !job.companyId) return;
  queue.push({
    tableName,
    recordId: job.recordId,
    companyId: job.companyId,
    changedBy: job.changedBy ?? null,
    action: job.action ?? 'update',
    snapshot: job.snapshot ?? null,
    previousSnapshot: job.previousSnapshot ?? null,
  });
  if (!processing) {
    setImmediate(() => {
      processQueue().catch((err) => {
        console.error('Transaction notification queue failed', err);
      });
    });
  }
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const job = queue.shift();
    try {
      // eslint-disable-next-line no-await-in-loop
      await handleTransactionNotification(job);
    } catch (err) {
      console.error('Transaction notification job failed', {
        error: err,
        job,
      });
    }
  }
  processing = false;
  if (queue.length > 0) {
    setImmediate(() => {
      processQueue().catch((err) => {
        console.error('Transaction notification queue failed', err);
      });
    });
  }
}

function getCaseInsensitive(row, field) {
  if (!row || !field) return undefined;
  if (row[field] !== undefined) return row[field];
  const lower = String(field).toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key ? row[key] : undefined;
}

function deriveTransactionName(row, tableName) {
  const candidates = [
    'TRTYPENAME',
    'trtypename',
    'UITransTypeName',
    'uitranstypename',
    'TransTypeName',
    'transaction_name',
    'transtype',
    'TransType',
    'UITransType',
  ];
  for (const candidate of candidates) {
    const val = getCaseInsensitive(row, candidate);
    if (val !== undefined && val !== null && String(val).trim()) {
      return String(val).trim();
    }
  }
  const fallback = tableName.replace(/^transactions_/i, '').replace(/_/g, ' ');
  return fallback ? fallback.replace(/\b\w/g, (m) => m.toUpperCase()) : 'Transaction';
}

function parseJsonValue(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizeReferenceIds(value, idField) {
  const ids = [];
  if (value === undefined || value === null || value === '') return ids;
  const pushId = (val) => {
    if (val === undefined || val === null || val === '') return;
    ids.push(val);
  };
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        if (idField && entry[idField] !== undefined) {
          pushId(entry[idField]);
        } else if (entry.id !== undefined) {
          pushId(entry.id);
        }
      } else {
        pushId(entry);
      }
    });
    return ids;
  }
  if (value && typeof value === 'object') {
    if (idField && value[idField] !== undefined) {
      pushId(value[idField]);
    } else if (value.id !== undefined) {
      pushId(value.id);
    }
    return ids;
  }
  const parsed = parseJsonValue(value);
  if (parsed) {
    return normalizeReferenceIds(parsed, idField);
  }
  pushId(value);
  return ids;
}

function normalizeFieldValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildSummary(referenceRow, fields = []) {
  const summaryFields = [];
  const parts = [];
  fields.forEach((field) => {
    const rawValue = getCaseInsensitive(referenceRow, field);
    const value = normalizeFieldValue(rawValue);
    if (!value) return;
    summaryFields.push({ field, value });
    parts.push(value);
  });
  return {
    summaryFields,
    summaryText: parts.join(' '),
  };
}

function normalizeFieldList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((field) => (typeof field === 'string' ? field.trim() : ''))
    .filter((field) => field);
}

function hasNotifyFieldChanges(previousRow, currentRow, notifyFields) {
  if (!previousRow || !currentRow || !notifyFields.length) return true;
  return notifyFields.some((field) => {
    const prevValue = normalizeFieldValue(getCaseInsensitive(previousRow, field));
    const nextValue = normalizeFieldValue(getCaseInsensitive(currentRow, field));
    return prevValue !== nextValue;
  });
}

function buildEditSummary(previousRow, currentRow, notifyFields) {
  const summaryFields = [];
  const fieldNames = [];
  if (!previousRow || !currentRow || !notifyFields.length) {
    return { summaryFields, summaryText: '' };
  }
  notifyFields.forEach((field) => {
    const prevValue = normalizeFieldValue(getCaseInsensitive(previousRow, field));
    const nextValue = normalizeFieldValue(getCaseInsensitive(currentRow, field));
    if (prevValue === nextValue) return;
    const fromValue = prevValue || '—';
    const toValue = nextValue || '—';
    summaryFields.push({ field, value: `${fromValue} → ${toValue}` });
    fieldNames.push(field);
  });
  return {
    summaryFields,
    summaryText: fieldNames.length ? `Edited fields: ${fieldNames.join(', ')}` : '',
  };
}

async function resolveTransactionConfig(tableName, transactionRow, companyId) {
  if (!tableName) return null;
  const { config } = await getConfigsByTable(tableName, companyId);
  if (!config || typeof config !== 'object') return null;
  const entries = Object.values(config);
  if (!entries.length) return null;
  const matched = entries.find((entry) => {
    const field =
      typeof entry?.transactionTypeField === 'string'
        ? entry.transactionTypeField.trim()
        : '';
    const value =
      entry?.transactionTypeValue !== undefined && entry?.transactionTypeValue !== null
        ? String(entry.transactionTypeValue).trim()
        : '';
    if (!field || !value) return false;
    const rowValue = getCaseInsensitive(transactionRow, field);
    if (rowValue === undefined || rowValue === null) return false;
    return String(rowValue).trim() === value;
  });
  if (matched) return matched;
  const fallback = entries.find((entry) => {
    const field =
      typeof entry?.transactionTypeField === 'string'
        ? entry.transactionTypeField.trim()
        : '';
    const value =
      entry?.transactionTypeValue !== undefined && entry?.transactionTypeValue !== null
        ? String(entry.transactionTypeValue).trim()
        : '';
    return !field && !value;
  });
  return fallback ?? null;
}

function normalizeContactValues(raw) {
  const values = new Set();
  if (raw === undefined || raw === null || raw === '') return values;
  const add = (val) => {
    if (val === undefined || val === null) return;
    const text = String(val).trim();
    if (text) values.add(text);
  };
  if (Array.isArray(raw)) {
    raw.forEach((entry) => add(entry));
    return values;
  }
  const parsed = parseJsonValue(raw);
  if (parsed) {
    normalizeContactValues(parsed).forEach((entry) => values.add(entry));
    return values;
  }
  add(raw);
  return values;
}

async function fetchReferenceRow(table, idField, idValue, companyId) {
  if (!table || !idField) return null;
  const columns = await listTableColumns(table);
  if (!Array.isArray(columns) || !columns.includes(idField)) return null;
  const params = [idValue];
  const conditions = [`\`${idField}\` = ?`];
  if (columns.includes('company_id') && companyId != null) {
    conditions.push('`company_id` = ?');
    params.push(companyId);
  }
  const [rows] = await pool.query(
    `SELECT * FROM \`${table}\` WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params,
  );
  return rows?.[0] ?? null;
}

function pickDisplayConfig(entries, table, idField, referenceRow) {
  const candidates = entries.filter((entry) => entry.table === table);
  if (!candidates.length) return null;
  const idScoped = idField ? candidates.filter((entry) => entry.idField === idField) : [];
  const scoped = idScoped.length ? idScoped : candidates;
  if (!scoped.length) return null;
  if (referenceRow) {
    const exact = scoped.find((entry) => {
      if (!entry.filterColumn) return false;
      const value = getCaseInsensitive(referenceRow, entry.filterColumn);
      if (value === undefined || value === null) return false;
      return String(value).trim() === String(entry.filterValue ?? '').trim();
    });
    if (exact) return exact;
  }
  const fallback = scoped.find((entry) => !entry.filterColumn && !entry.filterValue);
  return fallback ?? scoped[0];
}

async function listEmpIdsByScope({ companyId, branchId, departmentId }) {
  if (!companyId) return [];
  const params = [companyId];
  const conditions = ['employment_company_id = ?', 'deleted_at IS NULL'];
  if (branchId) {
    conditions.push('employment_branch_id = ?');
    params.push(branchId);
  }
  if (departmentId) {
    conditions.push('employment_department_id = ?');
    params.push(departmentId);
  }
  const [rows] = await pool.query(
    `SELECT employment_emp_id AS empId
       FROM tbl_employment
      WHERE ${conditions.join(' AND ')}
      GROUP BY employment_emp_id`,
    params,
  );
  return Array.isArray(rows)
    ? rows.map((row) => row.empId).filter((val) => val !== null && val !== undefined)
    : [];
}

async function collectRecipients({
  transactionRow,
  relations,
  displayEntries,
  notifyFieldSet,
  companyId,
}) {
  if (!transactionRow) return new Set();
  const recipients = new Set();
  const scopeCache = new Map();
  const resolveScopeRecipients = async (scopeKey, loader) => {
    if (scopeCache.has(scopeKey)) return scopeCache.get(scopeKey);
    const result = await loader();
    scopeCache.set(scopeKey, result);
    return result;
  };

  for (const relation of relations) {
    if (
      notifyFieldSet &&
      notifyFieldSet.size > 0 &&
      !notifyFieldSet.has(String(relation.column).toLowerCase())
    ) {
      continue;
    }
    const rawValue = getCaseInsensitive(transactionRow, relation.column);
    let ids = normalizeReferenceIds(rawValue, relation.idField);
    if (relation.isArray && ids.length === 0) {
      const parsed = parseJsonValue(rawValue);
      ids = normalizeReferenceIds(parsed, relation.idField);
    }
    const uniqueIds = Array.from(
      new Set(ids.map((id) => String(id)).filter((id) => id !== '')),
    );
    for (const referenceId of uniqueIds) {
      const referenceRow = await fetchReferenceRow(
        relation.table,
        relation.idField,
        referenceId,
        companyId,
      );
      if (!referenceRow) continue;
      const config = pickDisplayConfig(
        displayEntries,
        relation.table,
        relation.idField,
        referenceRow,
      );
      const role = config?.notificationRole?.trim();
      if (!role || !NOTIFICATION_ROLE_SET.has(role) || role === 'customer') continue;
      if (role === 'employee') {
        const empId = getCaseInsensitive(referenceRow, relation.idField) ?? referenceId;
        if (empId !== undefined && empId !== null && String(empId).trim()) {
          recipients.add(String(empId).trim());
        }
        continue;
      }
      if (role === 'company') {
        const scopeKey = `company:${companyId}`;
        const idsByScope = await resolveScopeRecipients(scopeKey, () =>
          listEmpIdsByScope({ companyId }),
        );
        idsByScope.forEach((id) => recipients.add(String(id).trim()));
        continue;
      }
      if (role === 'branch') {
        const scopeKey = `branch:${companyId}:${referenceId}`;
        const idsByScope = await resolveScopeRecipients(scopeKey, () =>
          listEmpIdsByScope({ companyId, branchId: referenceId }),
        );
        idsByScope.forEach((id) => recipients.add(String(id).trim()));
        continue;
      }
      if (role === 'department') {
        const scopeKey = `department:${companyId}:${referenceId}`;
        const idsByScope = await resolveScopeRecipients(scopeKey, () =>
          listEmpIdsByScope({ companyId, departmentId: referenceId }),
        );
        idsByScope.forEach((id) => recipients.add(String(id).trim()));
      }
    }
  }

  return recipients;
}

async function updateNotifications({ notificationIds = [], message, updatedBy, markUnread }) {
  if (!notificationIds.length) return 0;
  const normalizedIds = notificationIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
  if (!normalizedIds.length) return 0;
  const updateSql = markUnread
    ? `UPDATE notifications
        SET message = ?, updated_by = ?, updated_at = NOW(), is_read = 0
      WHERE notification_id IN (?)`
    : `UPDATE notifications
        SET message = ?, updated_by = ?, updated_at = NOW()
      WHERE notification_id IN (?)`;
  const [result] = await pool.query(updateSql, [message, updatedBy ?? null, normalizedIds]);
  return result?.affectedRows ?? 0;
}

async function updateExistingTransactionNotifications({
  companyId,
  relatedId,
  action,
  updatedBy,
  transactionName,
  summaryFields,
  summaryText,
  allowedRecipients,
  excludedRecipients,
}) {
  const [rows] = await pool.query(
    `SELECT notification_id, message, recipient_empid, created_at, created_by, type, related_id
       FROM notifications
      WHERE company_id = ?
        AND related_id = ?
        AND deleted_at IS NULL
        AND message LIKE '%"kind":"transaction"%'
      ORDER BY notification_id ASC`,
    [companyId ?? null, relatedId],
  );
  let updated = 0;
  const payloads = [];
  const updatedAt = new Date().toISOString();
  for (const row of rows || []) {
    const recipient = row?.recipient_empid ? String(row.recipient_empid).trim() : '';
    const isExcluded =
      excludedRecipients &&
      excludedRecipients.size > 0 &&
      recipient &&
      excludedRecipients.has(recipient);
    if (
      !isExcluded &&
      allowedRecipients &&
      allowedRecipients.size > 0 &&
      recipient &&
      !allowedRecipients.has(recipient)
    ) {
      continue;
    }
    if (!row?.message) continue;
    let payload;
    try {
      payload = JSON.parse(row.message);
    } catch {
      continue;
    }
    if (!payload || payload.kind !== 'transaction') continue;
    const baseSummaryFields =
      summaryFields !== undefined ? summaryFields : payload.summaryFields || [];
    const nextSummaryFields = isExcluded ? payload.summaryFields || [] : baseSummaryFields;
    const nextSummaryText =
      summaryText !== undefined ? summaryText : payload.summaryText || '';
    const nextAction = isExcluded ? 'excluded' : action;
    const nextCreatedBy =
      updatedBy ?? payload.createdBy ?? payload.created_by ?? row.created_by ?? null;
    const nextPayload = {
      ...payload,
      action: nextAction,
      transactionName: transactionName || payload.transactionName,
      summaryFields: nextSummaryFields,
      summaryText: isExcluded ? 'Excluded from transaction' : nextSummaryText,
      createdBy: nextCreatedBy,
      updatedAt,
    };
    const message = JSON.stringify(nextPayload);
    // eslint-disable-next-line no-await-in-loop
    updated += await updateNotifications({
      notificationIds: [row.notification_id],
      message,
      updatedBy,
      markUnread: true,
    });
    if (row.recipient_empid) {
      payloads.push({
        room: `user:${row.recipient_empid}`,
        payload: {
          id: row.notification_id,
          type: row.type,
          kind: nextPayload.kind ?? row.type,
          message,
          related_id: row.related_id,
          created_at: row.created_at
            ? new Date(row.created_at).toISOString()
            : new Date().toISOString(),
          updated_at: updatedAt,
          sender: row.created_by ?? null,
        },
      });
    }
  }
  return { updated, payloads };
}

function emitNotificationEvent(rooms, payload) {
  if (!ioEmitter || !rooms.length) return;
  rooms.forEach((room) => {
    ioEmitter.to(room).emit('notification:new', payload);
  });
}

async function handleTransactionNotification(job) {
  if (!job?.tableName || !job?.recordId || !job?.companyId) return;
  const transactionRow =
    job.action === 'delete'
      ? job.snapshot
      : await getTableRowById(job.tableName, job.recordId, {
          defaultCompanyId: job.companyId,
        });
  if (!transactionRow) return;

  const [dbRelations, customRelations, displayConfig, transactionConfig] =
    await Promise.all([
      listTableRelationships(job.tableName),
      listCustomRelations(job.tableName, job.companyId),
      getAllDisplayFields(job.companyId),
      resolveTransactionConfig(job.tableName, transactionRow, job.companyId),
    ]);

  const relations = [];
  if (Array.isArray(dbRelations)) {
    dbRelations.forEach((rel) => {
      if (!rel?.COLUMN_NAME || !rel?.REFERENCED_TABLE_NAME) return;
      relations.push({
        column: rel.COLUMN_NAME,
        table: rel.REFERENCED_TABLE_NAME,
        idField: rel.REFERENCED_COLUMN_NAME,
        isArray: false,
      });
    });
  }
  if (customRelations?.config && typeof customRelations.config === 'object') {
    Object.entries(customRelations.config).forEach(([column, entries]) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => {
        if (!entry?.table || !entry?.column) return;
        relations.push({
          column,
          table: entry.table,
          idField: entry.idField ?? entry.column,
          isArray: Boolean(entry.isArray),
          filterColumn: entry.filterColumn ?? null,
          filterValue: entry.filterValue ?? null,
        });
      });
    });
  }

  if (!relations.length) return;
  const notifyFields = normalizeFieldList(transactionConfig?.notifyFields);
  if (!notifyFields.length) return;
  const actionLabel = job.action ?? 'update';
  const rawEditSummary =
    job.action === 'update'
      ? buildEditSummary(job.previousSnapshot, transactionRow, notifyFields)
      : { summaryFields: [], summaryText: '' };
  const editSummary =
    job.action === 'update' && !rawEditSummary.summaryText
      ? { ...rawEditSummary, summaryText: 'Transaction edited' }
      : rawEditSummary;
  if (
    job.action === 'update' &&
    !hasNotifyFieldChanges(job.previousSnapshot, transactionRow, notifyFields)
  ) {
    return;
  }
  const notifyFieldSet = new Set(notifyFields.map((field) => field.toLowerCase()));
  const displayEntries = Array.isArray(displayConfig?.config) ? displayConfig.config : [];
  const notificationFieldList = normalizeFieldList(transactionConfig?.notificationFields);
  const dashboardFieldList = normalizeFieldList(
    transactionConfig?.notificationDashboardFields,
  );
  const phoneFieldList = normalizeFieldList(transactionConfig?.notificationPhoneFields);
  const emailFieldList = normalizeFieldList(transactionConfig?.notificationEmailFields);
  const notificationSummaryBase = buildSummary(transactionRow, notificationFieldList);
  const dashboardSummaryBase = buildSummary(transactionRow, dashboardFieldList);
  const phoneSummaryBase = buildSummary(transactionRow, phoneFieldList);
  const emailSummaryBase = buildSummary(transactionRow, emailFieldList);
  const recipients =
    job.action === 'update' || job.action === 'delete'
      ? await collectRecipients({
          transactionRow,
          relations,
          displayEntries,
          notifyFieldSet,
          companyId: job.companyId,
        })
      : null;
  let excludedRecipients = new Set();
  if (job.action === 'update' && job.previousSnapshot) {
    const previousRecipients = await collectRecipients({
      transactionRow: job.previousSnapshot,
      relations,
      displayEntries,
      notifyFieldSet,
      companyId: job.companyId,
    });
    excludedRecipients = new Set(
      Array.from(previousRecipients).filter((id) => !recipients.has(id)),
    );
  }
  if (job.action === 'update' || job.action === 'delete') {
    const transactionName = deriveTransactionName(transactionRow, job.tableName);
    const { updated, payloads } = await updateExistingTransactionNotifications({
      companyId: job.companyId,
      relatedId: job.recordId,
      action: job.action ?? 'update',
      updatedBy: job.changedBy,
      transactionName,
      summaryFields:
        job.action === 'update'
          ? editSummary.summaryFields
          : dashboardSummaryBase.summaryFields.length
            ? dashboardSummaryBase.summaryFields
            : notificationSummaryBase.summaryFields,
      summaryText:
        job.action === 'update' ? editSummary.summaryText : 'Transaction deleted',
      allowedRecipients: recipients,
      excludedRecipients,
    });
    if (payloads.length) {
      payloads.forEach(({ room, payload }) => emitNotificationEvent([room], payload));
    }
    if (updated > 0) {
      return;
    }
  }
  const transactionName = deriveTransactionName(transactionRow, job.tableName);

  const handled = new Set();
  for (const relation of relations) {
    if (
      notifyFieldSet.size > 0 &&
      !notifyFieldSet.has(String(relation.column).toLowerCase())
    ) {
      continue;
    }
    const rawValue = getCaseInsensitive(transactionRow, relation.column);
    let ids = normalizeReferenceIds(rawValue, relation.idField);
    if (relation.isArray && ids.length === 0) {
      const parsed = parseJsonValue(rawValue);
      ids = normalizeReferenceIds(parsed, relation.idField);
    }
    const uniqueIds = Array.from(
      new Set(ids.map((id) => String(id)).filter((id) => id !== '')),
    );
    for (const referenceId of uniqueIds) {
      const dedupeKey = `${relation.table}|${relation.idField}|${referenceId}`;
      if (handled.has(dedupeKey)) continue;
      handled.add(dedupeKey);

      // eslint-disable-next-line no-await-in-loop
      const referenceRow = await fetchReferenceRow(
        relation.table,
        relation.idField,
        referenceId,
        job.companyId,
      );
      if (!referenceRow) continue;

      const config = pickDisplayConfig(
        displayEntries,
        relation.table,
        relation.idField,
        referenceRow,
      );
      const role = config?.notificationRole?.trim();
      if (!role || !NOTIFICATION_ROLE_SET.has(role)) continue;

      const { summaryFields: referenceSummaryFields, summaryText: referenceSummaryText } =
        buildSummary(referenceRow, config?.notificationDashboardFields ?? []);
      const summaryFields =
        job.action === 'update' && editSummary.summaryFields.length
          ? editSummary.summaryFields
          : job.action === 'delete'
            ? dashboardSummaryBase.summaryFields.length
              ? dashboardSummaryBase.summaryFields
              : notificationSummaryBase.summaryFields.length
                ? notificationSummaryBase.summaryFields
                : referenceSummaryFields
            : dashboardSummaryBase.summaryFields.length
              ? dashboardSummaryBase.summaryFields
              : referenceSummaryFields;
      const summaryText =
        job.action === 'update' && editSummary.summaryText
          ? editSummary.summaryText
          : job.action === 'delete'
            ? 'Transaction deleted'
            : dashboardSummaryBase.summaryText || referenceSummaryText;

      const messagePayload = {
        kind: 'transaction',
        transactionName,
        transactionTable: job.tableName,
        transactionId: job.recordId,
        action: actionLabel,
        referenceTable: relation.table,
        referenceId,
        role,
        summaryFields,
        summaryText,
        createdBy: job.changedBy,
        updatedAt: new Date().toISOString(),
      };
      const message = JSON.stringify(messagePayload);

      const emails = new Set();
      const phones = new Set();
      (config?.notificationEmailFields ?? []).forEach((field) => {
        const value = getCaseInsensitive(referenceRow, field);
        normalizeContactValues(value).forEach((entry) => emails.add(entry));
      });
      (config?.notificationPhoneFields ?? []).forEach((field) => {
        const value = getCaseInsensitive(referenceRow, field);
        normalizeContactValues(value).forEach((entry) => phones.add(entry));
      });

      if (role !== 'customer') {
        let recipients = [];
        if (role === 'employee') {
          const empId = getCaseInsensitive(referenceRow, relation.idField) ?? referenceId;
          recipients = empId ? [empId] : [];
        } else if (role === 'company') {
          recipients = await listEmpIdsByScope({ companyId: job.companyId });
        } else if (role === 'branch') {
          recipients = await listEmpIdsByScope({
            companyId: job.companyId,
            branchId: referenceId,
          });
        } else if (role === 'department') {
          recipients = await listEmpIdsByScope({
            companyId: job.companyId,
            departmentId: referenceId,
          });
        }

        const uniqueRecipients = Array.from(
          new Set(
            recipients
              .map((entry) => String(entry).trim())
              .filter((entry) => entry),
          ),
        );

        if (uniqueRecipients.length) {
          for (const recipient of uniqueRecipients) {
            // eslint-disable-next-line no-await-in-loop
            await notifyUser({
              companyId: job.companyId,
              recipientEmpId: recipient,
              type: 'request',
              kind: 'transaction',
              relatedId: job.recordId,
              message,
              createdBy: job.changedBy,
            });
          }
        }
      }

      if (emails.size) {
        console.info('Transaction notification email', {
          to: Array.from(emails),
          transactionName,
          referenceTable: relation.table,
          referenceId,
        });
      }
      if (phones.size) {
        console.info('Transaction notification phone', {
          to: Array.from(phones),
          transactionName,
          referenceTable: relation.table,
          referenceId,
        });
      }
    }
  }
}

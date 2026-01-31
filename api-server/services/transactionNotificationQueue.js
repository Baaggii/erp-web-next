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
const EXCLUDED_SUMMARY_TEXT = 'Excluded from transaction';
const INCLUDED_SUMMARY_TEXT = 'Included in transaction';

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

function buildReferenceKey(referenceTable, referenceId) {
  if (!referenceTable || referenceId === undefined || referenceId === null || referenceId === '') {
    return '';
  }
  return `${String(referenceTable).toLowerCase()}|${String(referenceId)}`;
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

function buildActiveReferenceKeys({ transactionRow, relations = [], notifyFieldSet }) {
  if (!transactionRow || !Array.isArray(relations) || relations.length === 0) return new Set();
  const keys = new Set();
  relations.forEach((relation) => {
    if (!relation?.column || !relation?.table) return;
    if (
      notifyFieldSet &&
      notifyFieldSet.size > 0 &&
      !notifyFieldSet.has(String(relation.column).toLowerCase())
    ) {
      return;
    }
    const rawValue = getCaseInsensitive(transactionRow, relation.column);
    let ids = normalizeReferenceIds(rawValue, relation.idField);
    if (relation.isArray && ids.length === 0) {
      const parsed = parseJsonValue(rawValue);
      ids = normalizeReferenceIds(parsed, relation.idField);
    }
    ids
      .map((id) => buildReferenceKey(relation.table, id))
      .filter((key) => key)
      .forEach((key) => keys.add(key));
  });
  return keys;
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
  activeReferenceKeys,
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
  const existingReferenceKeys = new Set();
  const updatedAt = new Date().toISOString();
  for (const row of rows || []) {
    if (!row?.message) continue;
    let payload;
    try {
      payload = JSON.parse(row.message);
    } catch {
      continue;
    }
    if (!payload || payload.kind !== 'transaction') continue;
    const referenceKey = buildReferenceKey(payload.referenceTable, payload.referenceId);
    if (referenceKey) {
      existingReferenceKeys.add(referenceKey);
    }
    const isActive =
      !activeReferenceKeys || activeReferenceKeys.size === 0
        ? true
        : activeReferenceKeys.has(referenceKey);
    if (action === 'update' && !isActive) {
      if (payload.excluded) continue;
      const nextPayload = {
        ...payload,
        action: 'excluded',
        summaryFields:
          summaryFields !== undefined ? summaryFields : payload.summaryFields || [],
        summaryText: EXCLUDED_SUMMARY_TEXT,
        excluded: true,
        actor: updatedBy ?? payload.actor ?? payload.createdBy ?? null,
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
      continue;
    }
    if (action === 'update' && payload.excluded && isActive) {
      const nextPayload = {
        ...payload,
        action: 'included',
        summaryFields:
          summaryFields !== undefined ? summaryFields : payload.summaryFields || [],
        summaryText: INCLUDED_SUMMARY_TEXT,
        excluded: false,
        actor: updatedBy ?? payload.actor ?? payload.createdBy ?? null,
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
      continue;
    }
    if (!isActive && action === 'update') continue;
    const nextSummaryFields =
      summaryFields !== undefined ? summaryFields : payload.summaryFields || [];
    const nextSummaryText =
      summaryText !== undefined ? summaryText : payload.summaryText || '';
    const nextPayload = {
      ...payload,
      action,
      transactionName: transactionName || payload.transactionName,
      summaryFields: nextSummaryFields,
      summaryText: nextSummaryText,
      actor: updatedBy ?? payload.actor ?? payload.createdBy ?? null,
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
  return { updated, payloads, existingReferenceKeys };
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
  const editFieldList = normalizeFieldList(
    transactionConfig?.notificationDashboardFields?.length
      ? transactionConfig.notificationDashboardFields
      : transactionConfig?.notificationFields?.length
        ? transactionConfig.notificationFields
        : notifyFields,
  );
  const actionLabel = job.action ?? 'update';
  const deleteSummary = buildSummary(transactionRow, editFieldList);
  const rawEditSummary =
    job.action === 'update'
      ? buildEditSummary(job.previousSnapshot, transactionRow, editFieldList)
      : job.action === 'delete'
        ? { summaryFields: deleteSummary.summaryFields, summaryText: 'Transaction deleted' }
        : { summaryFields: [], summaryText: '' };
  const editSummary =
    job.action === 'update' && !rawEditSummary.summaryText
      ? { ...rawEditSummary, summaryText: 'Transaction edited' }
      : rawEditSummary;
  const notifyFieldSet = notifyFields.length
    ? new Set(notifyFields.map((field) => field.toLowerCase()))
    : null;
  const activeReferenceKeys = buildActiveReferenceKeys({
    transactionRow,
    relations,
    notifyFieldSet,
  });
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
  const configuredSummaryFields =
    dashboardSummaryBase.summaryFields.length > 0
      ? dashboardSummaryBase.summaryFields
      : notificationSummaryBase.summaryFields;
  let existingReferenceKeys;
  if (job.action === 'update' || job.action === 'delete') {
    const transactionName = deriveTransactionName(transactionRow, job.tableName);
    const updateResult = await updateExistingTransactionNotifications({
      companyId: job.companyId,
      relatedId: job.recordId,
      action: job.action ?? 'update',
      updatedBy: job.changedBy,
      transactionName,
      summaryFields: configuredSummaryFields,
      summaryText: editSummary.summaryText,
      activeReferenceKeys,
    });
    const { updated, payloads } = updateResult;
    existingReferenceKeys = updateResult.existingReferenceKeys;
    if (payloads.length) {
      payloads.forEach(({ room, payload }) => emitNotificationEvent([room], payload));
    }
    if (updated > 0 && job.action !== 'update') {
      return;
    }
  }
  if (job.action === 'update' && editFieldList.length) {
    const hasFieldChanges = hasNotifyFieldChanges(
      job.previousSnapshot,
      transactionRow,
      editFieldList,
    );
    const hasNewRecipients =
      activeReferenceKeys &&
      existingReferenceKeys &&
      Array.from(activeReferenceKeys).some((key) => !existingReferenceKeys.has(key));
    if (!hasFieldChanges && !hasNewRecipients) {
      return;
    }
  }
  const displayEntries = Array.isArray(displayConfig?.config) ? displayConfig.config : [];
  const transactionName = deriveTransactionName(transactionRow, job.tableName);

  const handled = new Set();
  for (const relation of relations) {
    if (notifyFieldSet && !notifyFieldSet.has(String(relation.column).toLowerCase())) {
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
      const deleteSummaryFields = dashboardSummaryBase.summaryFields.length
        ? dashboardSummaryBase.summaryFields
        : notificationSummaryBase.summaryFields;
      const summaryFields =
        job.action === 'update' || job.action === 'delete'
          ? configuredSummaryFields
          : dashboardSummaryBase.summaryFields.length
            ? dashboardSummaryBase.summaryFields
            : referenceSummaryFields;
      const summaryText =
        job.action === 'update' && editSummary.summaryText
          ? editSummary.summaryText
          : job.action === 'delete'
            ? 'Transaction deleted'
            : dashboardSummaryBase.summaryText || referenceSummaryText;
      const referenceKey = buildReferenceKey(relation.table, referenceId);
      const isExistingRecipient =
        job.action === 'update' &&
        existingReferenceKeys &&
        existingReferenceKeys.has(referenceKey);
      if (isExistingRecipient) {
        continue;
      }
      const actionForRecipient =
        job.action === 'update' && !isExistingRecipient ? 'included' : actionLabel;
      const summaryTextForRecipient =
        actionForRecipient === 'included' ? INCLUDED_SUMMARY_TEXT : summaryText;

      const messagePayload = {
        kind: 'transaction',
        transactionName,
        transactionTable: job.tableName,
        transactionId: job.recordId,
        action: actionForRecipient,
        referenceTable: relation.table,
        referenceId,
        role,
        summaryFields,
        summaryText: summaryTextForRecipient,
        actor: job.changedBy ?? null,
        updatedAt: new Date().toISOString(),
        excluded: false,
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

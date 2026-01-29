import { pool } from '../../db/index.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { sendEmail } from './emailService.js';

const NOTIFICATION_PREFIX = 'New transaction: ';

function parseValueList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        if (parsed !== undefined && parsed !== null) return [parsed];
      } catch {
        // fall through
      }
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [trimmed];
  }
  return [value];
}

function normalizeRecipientList(values) {
  const normalized = new Set();
  values.forEach((value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (!str) return;
    normalized.add(str);
  });
  return Array.from(normalized);
}

function normalizeEmailList(values) {
  const normalized = new Set();
  values.forEach((value) => {
    if (!value) return;
    const str = String(value).trim();
    if (!str || !str.includes('@')) return;
    normalized.add(str);
  });
  return Array.from(normalized);
}

function resolveMatchingConfig(configsByName = {}, row = {}) {
  const entries = Object.entries(configsByName || {});
  if (entries.length === 0) return null;
  if (entries.length === 1) {
    const [name, config] = entries[0];
    return { name, config };
  }
  for (const [name, config] of entries) {
    if (!config || !config.transactionTypeField || !config.transactionTypeValue) continue;
    const rowValue = row?.[config.transactionTypeField];
    if (rowValue === undefined || rowValue === null) continue;
    if (String(rowValue) === String(config.transactionTypeValue)) {
      return { name, config };
    }
  }
  const [fallbackName, fallbackConfig] = entries[0];
  return { name: fallbackName, config: fallbackConfig };
}

async function insertNotifications({
  recipients,
  companyId,
  message,
  relatedId,
  createdBy,
  type = 'transaction',
}) {
  const normalizedRecipients = normalizeRecipientList(recipients);
  if (normalizedRecipients.length === 0) return;
  for (const recipient of normalizedRecipients) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        companyId ?? null,
        recipient,
        type ?? 'transaction',
        relatedId ?? null,
        message ?? '',
        createdBy ?? null,
      ],
    );
  }
}

async function fetchScopedRecipients({ scope, values, companyId }) {
  const normalizedValues = normalizeRecipientList(values);
  if (!normalizedValues.length) return [];
  if (scope === 'company') {
    const [rows] = await pool.query(
      'SELECT empid FROM users WHERE company_id = ? AND company_id IN (?)',
      [companyId, normalizedValues],
    );
    return rows.map((row) => row.empid).filter(Boolean);
  }
  if (scope === 'department') {
    const [rows] = await pool.query(
      'SELECT empid FROM users WHERE company_id = ? AND department_id IN (?)',
      [companyId, normalizedValues],
    );
    return rows.map((row) => row.empid).filter(Boolean);
  }
  if (scope === 'branch') {
    const [rows] = await pool.query(
      'SELECT empid FROM users WHERE company_id = ? AND branch_id IN (?)',
      [companyId, normalizedValues],
    );
    return rows.map((row) => row.empid).filter(Boolean);
  }
  return [];
}

async function sendNotificationEmails({ emails, transactionName }) {
  const normalizedEmails = normalizeEmailList(emails);
  if (normalizedEmails.length === 0) return;
  const subject = `New transaction: ${transactionName}`;
  const html = `<p>A new transaction (${transactionName}) has been created.</p>`;
  for (const address of normalizedEmails) {
    // eslint-disable-next-line no-await-in-loop
    await sendEmail(address, subject, html);
  }
}

export async function notifyTransactionCreation({
  table,
  row,
  companyId,
  createdBy,
  relatedId,
}) {
  if (!table || !row) return;
  const { config: configsByName } = await getConfigsByTable(table, companyId);
  const matched = resolveMatchingConfig(configsByName, row);
  if (!matched) return;
  const { name: transactionName, config } = matched;
  const notificationConfig = config?.notificationConfig || {};
  const message = `${NOTIFICATION_PREFIX}${transactionName}`;

  const scopeDefinitions = [
    { key: 'employee', notifyScope: 'employee' },
    { key: 'company', notifyScope: 'company' },
    { key: 'department', notifyScope: 'department' },
    { key: 'branch', notifyScope: 'branch' },
  ];

  for (const scope of scopeDefinitions) {
    const entry = notificationConfig?.[scope.key];
    if (!entry || !entry.field) continue;
    const values = parseValueList(row?.[entry.field]);
    if (values.length === 0) continue;

    let recipients = [];
    if (scope.notifyScope === 'employee') {
      recipients = normalizeRecipientList(values);
    } else {
      // eslint-disable-next-line no-await-in-loop
      recipients = await fetchScopedRecipients({
        scope: scope.notifyScope,
        values,
        companyId,
      });
    }

    if (recipients.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await insertNotifications({
        recipients,
        companyId,
        message,
        relatedId,
        createdBy,
      });
    }

    if (entry.emailField) {
      const emails = parseValueList(row?.[entry.emailField]);
      // eslint-disable-next-line no-await-in-loop
      await sendNotificationEmails({ emails, transactionName });
    }
  }

  const customerEntry = notificationConfig?.customer;
  if (customerEntry?.emailField) {
    const emails = parseValueList(row?.[customerEntry.emailField]);
    await sendNotificationEmails({ emails, transactionName });
  }
}

export async function listTransactionNotifications({
  empid,
  companyId,
  limit = 50,
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const [rows] = await pool.query(
    `SELECT id, message, related_id, created_at
     FROM notifications
     WHERE company_id = ? AND recipient_empid = ? AND type = 'transaction'
     ORDER BY created_at DESC
     LIMIT ?`,
    [companyId, empid, safeLimit],
  );
  const normalizedRows = rows.map((row) => {
    const message = typeof row.message === 'string' ? row.message : '';
    const transactionName = message.startsWith(NOTIFICATION_PREFIX)
      ? message.slice(NOTIFICATION_PREFIX.length).trim()
      : 'Other';
    return {
      id: row.id,
      message,
      relatedId: row.related_id,
      createdAt: row.created_at,
      transactionName: transactionName || 'Other',
    };
  });
  return { rows: normalizedRows };
}

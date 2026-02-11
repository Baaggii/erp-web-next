import crypto from 'node:crypto';
import { pool, getEmploymentSession } from '../../db/index.js';

const DEFAULT_EDIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4000;
const CURSOR_PAGE_SIZE = 50;
const MAX_RATE_WINDOW_MS = 60_000;
const MAX_RATE_MESSAGES = 20;

let initialized = false;
let ioRef = null;

const onlineByCompany = new Map();
const recentMessagesBySender = new Map();

function createError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function toId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nowIso() {
  return new Date().toISOString();
}

function eventPayloadBase(ctx) {
  return {
    correlationId: ctx.correlationId,
    companyId: ctx.companyId,
    at: nowIso(),
  };
}

function sanitizeBody(value) {
  const body = String(value ?? '').trim();
  if (!body) throw createError(400, 'MESSAGE_BODY_REQUIRED', 'Message body is required');
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw createError(400, 'MESSAGE_BODY_TOO_LONG', `Message body exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }
  return body;
}

function validateLinkedContext(linkedType, linkedId) {
  if (!linkedType && !linkedId) return { linkedType: null, linkedId: null };
  const safeType = String(linkedType || '').trim();
  const safeId = String(linkedId || '').trim();
  if (!safeType || !safeId) {
    throw createError(400, 'LINKED_CONTEXT_INVALID', 'linkedType and linkedId must both be provided');
  }
  return { linkedType: safeType.slice(0, 64), linkedId: safeId.slice(0, 128) };
}

function isProfanity(body) {
  return /\b(fuck|shit|bitch|asshole)\b/i.test(body);
}

function isSpam(body) {
  return /(.)\1{12,}/.test(body) || /(https?:\/\/\S+){4,}/i.test(body);
}

function enforceRateLimit(companyId, empid, body) {
  const key = `${companyId}:${empid}`;
  const now = Date.now();
  const history = (recentMessagesBySender.get(key) || []).filter((entry) => now - entry.ts <= MAX_RATE_WINDOW_MS);
  if (history.length >= MAX_RATE_MESSAGES) {
    throw createError(429, 'RATE_LIMITED', 'Too many messages in a short period');
  }
  const duplicate = history.find((entry) => entry.body === body);
  if (duplicate) {
    throw createError(429, 'DUPLICATE_MESSAGE', 'Duplicate message detected');
  }
  history.push({ ts: now, body });
  recentMessagesBySender.set(key, history);
}

async function ensureSchema(db = pool) {
  if (initialized) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS erp_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      company_id BIGINT UNSIGNED NOT NULL,
      author_empid VARCHAR(64) NOT NULL,
      parent_message_id BIGINT UNSIGNED NULL,
      linked_type VARCHAR(64) NULL,
      linked_id VARCHAR(128) NULL,
      body TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      deleted_by_empid VARCHAR(64) NULL,
      PRIMARY KEY (id),
      KEY idx_messages_company_id_id (company_id, id),
      KEY idx_messages_parent (parent_message_id),
      KEY idx_messages_link (company_id, linked_type, linked_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS erp_message_idempotency (
      company_id BIGINT UNSIGNED NOT NULL,
      empid VARCHAR(64) NOT NULL,
      idem_key VARCHAR(128) NOT NULL,
      message_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (company_id, empid, idem_key),
      KEY idx_idem_message (message_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS erp_message_receipts (
      message_id BIGINT UNSIGNED NOT NULL,
      empid VARCHAR(64) NOT NULL,
      read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id, empid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS erp_presence_heartbeats (
      company_id BIGINT UNSIGNED NOT NULL,
      empid VARCHAR(64) NOT NULL,
      heartbeat_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(16) NOT NULL DEFAULT 'online',
      PRIMARY KEY (company_id, empid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS erp_messaging_abuse_audit (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      company_id BIGINT UNSIGNED NOT NULL,
      empid VARCHAR(64) NOT NULL,
      category VARCHAR(32) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      payload JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_abuse_company_empid (company_id, empid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  initialized = true;
}

async function resolveSession(user, companyId, getSession = getEmploymentSession) {
  const scopedCompanyId = toId(companyId) ?? toId(user?.companyId);
  if (!scopedCompanyId) throw createError(400, 'COMPANY_CONTEXT_INVALID', 'A valid companyId is required');
  const session = await getSession(user.empid, scopedCompanyId);
  if (!session) throw createError(403, 'COMPANY_MEMBERSHIP_REQUIRED', 'No active membership in company');
  return { scopedCompanyId, session };
}

function canModerate(session) {
  return Boolean(session?.permissions?.messaging_admin || session?.permissions?.system_settings);
}

function canMessage(session) {
  return canModerate(session) || session?.permissions?.messaging !== false;
}

function canDelete(session) {
  return canModerate(session) || session?.permissions?.messaging_delete === true;
}

async function logAbuse(db, { companyId, empid, category, reason, payload }) {
  await db.query(
    'INSERT INTO erp_messaging_abuse_audit (company_id, empid, category, reason, payload) VALUES (?, ?, ?, ?, ?)',
    [companyId, empid, category, reason, JSON.stringify(payload ?? null)],
  );
}

async function findMessageById(db, companyId, id) {
  const [rows] = await db.query(
    'SELECT * FROM erp_messages WHERE id = ? AND company_id = ? LIMIT 1',
    [id, companyId],
  );
  return rows[0] || null;
}

function emit(companyId, eventName, payload) {
  if (!ioRef) return;
  ioRef.to(`company:${companyId}`).emit(eventName, payload);
}

async function createMessageInternal({ db = pool, ctx, payload, parentMessageId = null, eventName = 'message.created' }) {
  const body = sanitizeBody(payload?.body);
  const { linkedType, linkedId } = validateLinkedContext(payload?.linkedType, payload?.linkedId);

  if (isProfanity(body) || isSpam(body)) {
    await logAbuse(db, {
      companyId: ctx.companyId,
      empid: ctx.user.empid,
      category: isProfanity(body) ? 'profanity' : 'spam',
      reason: 'Content rejected by policy',
      payload: { body: body.slice(0, 200) },
    });
    throw createError(422, 'CONTENT_POLICY_REJECTED', 'Message violates messaging policy');
  }

  const idempotencyKey = String(payload?.idempotencyKey || '').trim();
  if (!idempotencyKey) throw createError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required');

  const [existingRows] = await db.query(
    'SELECT message_id FROM erp_message_idempotency WHERE company_id = ? AND empid = ? AND idem_key = ? LIMIT 1',
    [ctx.companyId, ctx.user.empid, idempotencyKey],
  );
  if (existingRows[0]?.message_id) {
    const existingMessage = await findMessageById(db, ctx.companyId, existingRows[0].message_id);
    return { message: existingMessage, idempotentReplay: true };
  }

  enforceRateLimit(ctx.companyId, ctx.user.empid, body);

  const [result] = await db.query(
    `INSERT INTO erp_messages
      (company_id, author_empid, parent_message_id, linked_type, linked_id, body)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [ctx.companyId, ctx.user.empid, parentMessageId, linkedType, linkedId, body],
  );
  const messageId = result.insertId;
  await db.query(
    'INSERT INTO erp_message_idempotency (company_id, empid, idem_key, message_id) VALUES (?, ?, ?, ?)',
    [ctx.companyId, ctx.user.empid, idempotencyKey, messageId],
  );
  const message = await findMessageById(db, ctx.companyId, messageId);

  emit(ctx.companyId, eventName, {
    ...eventPayloadBase(ctx),
    message,
    optimistic: {
      tempId: payload?.clientTempId ?? null,
      accepted: true,
      replay: false,
    },
  });

  return { message, idempotentReplay: false };
}

export async function postMessage({ user, companyId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  await ensureSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throw createError(403, 'PERMISSION_DENIED', 'Messaging permission denied');
  const ctx = { user, companyId: scopedCompanyId, correlationId };
  return createMessageInternal({ db, ctx, payload, parentMessageId: null, eventName: 'message.created' });
}

export async function postReply({ user, companyId, messageId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  await ensureSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throw createError(403, 'PERMISSION_DENIED', 'Messaging permission denied');
  const message = await findMessageById(db, scopedCompanyId, messageId);
  if (!message || message.deleted_at) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');

  const ctx = { user, companyId: scopedCompanyId, correlationId };
  return createMessageInternal({
    db,
    ctx,
    payload: { ...payload, linkedType: message.linked_type, linkedId: message.linked_id },
    parentMessageId: message.id,
    eventName: 'thread.reply.created',
  });
}

export async function getMessages({ user, companyId, linkedType, linkedId, cursor, limit = CURSOR_PAGE_SIZE, correlationId, db = pool, getSession = getEmploymentSession }) {
  await ensureSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throw createError(403, 'PERMISSION_DENIED', 'Messaging permission denied');
  const parsedLimit = Math.min(Math.max(Number(limit) || CURSOR_PAGE_SIZE, 1), 100);
  const cursorId = toId(cursor);

  const filters = ['company_id = ?', 'parent_message_id IS NULL'];
  const params = [scopedCompanyId];
  if (linkedType && linkedId) {
    filters.push('linked_type = ?');
    filters.push('linked_id = ?');
    params.push(String(linkedType), String(linkedId));
  }
  if (cursorId) {
    filters.push('id < ?');
    params.push(cursorId);
  }
  filters.push('deleted_at IS NULL');

  const [rows] = await db.query(
    `SELECT * FROM erp_messages WHERE ${filters.join(' AND ')} ORDER BY id DESC LIMIT ?`,
    [...params, parsedLimit + 1],
  );

  const hasMore = rows.length > parsedLimit;
  const pageRows = hasMore ? rows.slice(0, parsedLimit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;

  return {
    correlationId,
    items: pageRows,
    pageInfo: { nextCursor, hasMore },
    optimistic: { cursorEcho: cursorId ?? null },
  };
}

export async function getThread({ user, companyId, messageId, correlationId, db = pool, getSession = getEmploymentSession }) {
  await ensureSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throw createError(403, 'PERMISSION_DENIED', 'Messaging permission denied');
  const root = await findMessageById(db, scopedCompanyId, messageId);
  if (!root || root.deleted_at) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');

  const [rows] = await db.query(
    `WITH RECURSIVE thread_cte AS (
      SELECT * FROM erp_messages WHERE id = ? AND company_id = ?
      UNION ALL
      SELECT m.*
      FROM erp_messages m
      INNER JOIN thread_cte t ON m.parent_message_id = t.id
      WHERE m.company_id = ?
    )
    SELECT * FROM thread_cte WHERE deleted_at IS NULL ORDER BY id ASC`,
    [messageId, scopedCompanyId, scopedCompanyId],
  );

  const [receiptResult] = await db.query(
    'INSERT IGNORE INTO erp_message_receipts (message_id, empid) VALUES (?, ?)',
    [messageId, user.empid],
  );
  if (receiptResult?.affectedRows) {
    emit(scopedCompanyId, 'receipt.read', {
      ...eventPayloadBase({ correlationId, companyId: scopedCompanyId }),
      messageId,
      empid: user.empid,
    });
  }

  return { correlationId, root, replies: rows.filter((row) => row.id !== root.id) };
}

export async function patchMessage({ user, companyId, messageId, payload, correlationId, db = pool, editWindowMs = DEFAULT_EDIT_WINDOW_MS, getSession = getEmploymentSession }) {
  await ensureSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  const message = await findMessageById(db, scopedCompanyId, messageId);
  if (!message || message.deleted_at) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  const moderator = canModerate(session);
  if (!moderator && message.author_empid !== user.empid) throw createError(403, 'PERMISSION_DENIED', 'Cannot edit this message');

  const createdAt = new Date(message.created_at).getTime();
  if (!moderator && Date.now() - createdAt > editWindowMs) {
    throw createError(409, 'EDIT_WINDOW_EXPIRED', 'Message edit window expired');
  }

  const body = sanitizeBody(payload?.body);
  await db.query('UPDATE erp_messages SET body = ? WHERE id = ? AND company_id = ?', [body, messageId, scopedCompanyId]);
  const updated = await findMessageById(db, scopedCompanyId, messageId);
  emit(scopedCompanyId, 'message.updated', { ...eventPayloadBase({ correlationId, companyId: scopedCompanyId }), message: updated });
  return { correlationId, message: updated };
}

export async function deleteMessage({ user, companyId, messageId, correlationId, db = pool, getSession = getEmploymentSession }) {
  await ensureSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  const message = await findMessageById(db, scopedCompanyId, messageId);
  if (!message || message.deleted_at) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');

  if (!canDelete(session) && message.author_empid !== user.empid) {
    throw createError(403, 'PERMISSION_DENIED', 'Cannot delete this message');
  }

  await db.query(
    'UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by_empid = ? WHERE id = ? AND company_id = ?',
    [user.empid, messageId, scopedCompanyId],
  );
  emit(scopedCompanyId, 'message.deleted', {
    ...eventPayloadBase({ correlationId, companyId: scopedCompanyId }),
    messageId,
    deletedByEmpid: user.empid,
  });
  return { correlationId, messageId, deleted: true };
}

export async function presenceHeartbeat({ user, companyId, status = 'online', correlationId, db = pool, getSession = getEmploymentSession }) {
  await ensureSchema(db);
  const { scopedCompanyId } = await resolveSession(user, companyId, getSession);
  const safeStatus = ['online', 'away', 'offline'].includes(status) ? status : 'online';
  await db.query(
    `INSERT INTO erp_presence_heartbeats (company_id, empid, heartbeat_at, status)
     VALUES (?, ?, CURRENT_TIMESTAMP, ?)
     ON DUPLICATE KEY UPDATE heartbeat_at = CURRENT_TIMESTAMP, status = VALUES(status)`,
    [scopedCompanyId, user.empid, safeStatus],
  );

  if (!onlineByCompany.has(scopedCompanyId)) onlineByCompany.set(scopedCompanyId, new Set());
  if (safeStatus === 'offline') {
    onlineByCompany.get(scopedCompanyId).delete(String(user.empid));
  } else {
    onlineByCompany.get(scopedCompanyId).add(String(user.empid));
  }

  emit(scopedCompanyId, 'presence.changed', {
    ...eventPayloadBase({ correlationId, companyId: scopedCompanyId }),
    empid: user.empid,
    status: safeStatus,
  });

  return { correlationId, empid: user.empid, status: safeStatus };
}

export async function getPresence({ user, companyId, userIds, db = pool, getSession = getEmploymentSession }) {
  await ensureSchema(db);
  const { scopedCompanyId } = await resolveSession(user, companyId, getSession);
  const ids = Array.from(new Set(String(userIds || '').split(',').map((entry) => entry.trim()).filter(Boolean)));
  if (!ids.length) return { companyId: scopedCompanyId, users: [] };

  const [rows] = await db.query(
    `SELECT empid, status, heartbeat_at
     FROM erp_presence_heartbeats
     WHERE company_id = ? AND empid IN (${ids.map(() => '?').join(',')})`,
    [scopedCompanyId, ...ids],
  );

  return { companyId: scopedCompanyId, users: rows };
}

export async function switchCompanyContext({ user, companyId, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  return {
    companyId: scopedCompanyId,
    membership: {
      empid: user.empid,
      branchId: session?.branch_id ?? null,
      departmentId: session?.department_id ?? null,
    },
  };
}

export function setMessagingIo(io) {
  ioRef = io;
}

export function markOnline(companyId, empid) {
  const scopedCompanyId = toId(companyId);
  if (!scopedCompanyId || !empid) return;
  if (!onlineByCompany.has(scopedCompanyId)) onlineByCompany.set(scopedCompanyId, new Set());
  onlineByCompany.get(scopedCompanyId).add(String(empid));
}

export function markOffline(companyId, empid) {
  const scopedCompanyId = toId(companyId);
  if (!scopedCompanyId || !empid || !onlineByCompany.has(scopedCompanyId)) return;
  onlineByCompany.get(scopedCompanyId).delete(String(empid));
}

export function createCorrelationId() {
  return crypto.randomUUID();
}

export function toStructuredError(error, correlationId) {
  const status = error?.status || 500;
  return {
    status,
    error: {
      code: error?.code || 'INTERNAL_ERROR',
      message: error?.message || 'Internal server error',
      details: error?.details,
      correlationId,
    },
  };
}

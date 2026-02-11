import crypto from 'node:crypto';
import { pool, getEmploymentSession } from '../../db/index.js';

const DEFAULT_EDIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4000;
const CURSOR_PAGE_SIZE = 50;
const MAX_RATE_WINDOW_MS = 60_000;
const MAX_RATE_MESSAGES = 20;
const LINKED_TYPE_ALLOWLIST = new Set(['transaction', 'plan', 'topic', 'task', 'ticket']);
const VISIBILITY_SCOPES = new Set(['company', 'department', 'private']);
const REQUIRED_MESSAGING_TABLES = [
  'erp_messages',
  'erp_message_idempotency',
  'erp_message_receipts',
  'erp_presence_heartbeats',
  'erp_messaging_abuse_audit',
];

const validatedDbConnections = new WeakSet();
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
  if (!LINKED_TYPE_ALLOWLIST.has(safeType)) {
    throw createError(400, 'LINKED_CONTEXT_TYPE_INVALID', 'Unsupported linkedType');
  }
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(safeId)) {
    throw createError(400, 'LINKED_CONTEXT_ID_INVALID', 'linkedId contains unsupported characters');
  }
  return { linkedType: safeType.slice(0, 64), linkedId: safeId.slice(0, 128) };
}

function normalizeVisibility(payload, session, user) {
  const scope = String(payload?.visibilityScope || 'company').trim().toLowerCase();
  if (!VISIBILITY_SCOPES.has(scope)) {
    throw createError(400, 'VISIBILITY_SCOPE_INVALID', 'visibilityScope must be company, department, or private');
  }
  const visibilityDepartmentId = scope === 'department' ? toId(payload?.visibilityDepartmentId ?? session?.department_id) : null;
  if (scope === 'department' && !visibilityDepartmentId) {
    throw createError(400, 'VISIBILITY_DEPARTMENT_REQUIRED', 'visibilityDepartmentId is required for department scope');
  }
  const visibilityEmpid = scope === 'private' ? String(payload?.visibilityEmpid || '').trim() : null;
  if (scope === 'private' && !visibilityEmpid) {
    throw createError(400, 'VISIBILITY_EMPID_REQUIRED', 'visibilityEmpid is required for private scope');
  }
  if (scope === 'private' && visibilityEmpid === String(user?.empid)) {
    throw createError(400, 'VISIBILITY_EMPID_INVALID', 'visibilityEmpid cannot be the same as author');
  }
  return {
    visibilityScope: scope,
    visibilityDepartmentId,
    visibilityEmpid,
  };
}

function getEncryptionKey() {
  const keyMaterial = process.env.MESSAGING_ENCRYPTION_KEY || '';
  if (!keyMaterial) return null;
  return crypto.createHash('sha256').update(keyMaterial).digest();
}

function encryptBody(plainText) {
  const key = getEncryptionKey();
  if (!key) return { body: plainText, bodyCiphertext: null, bodyIv: null, bodyAuthTag: null, encrypted: false };

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    body: null,
    bodyCiphertext: encrypted.toString('base64'),
    bodyIv: iv.toString('base64'),
    bodyAuthTag: tag.toString('base64'),
    encrypted: true,
  };
}

function decryptBody(message) {
  if (!message?.body_ciphertext || !message?.body_iv || !message?.body_auth_tag) return message?.body || '';
  const key = getEncryptionKey();
  if (!key) return '[encrypted-message]';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(message.body_iv, 'base64'));
    decipher.setAuthTag(Buffer.from(message.body_auth_tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(message.body_ciphertext, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '[encrypted-message]';
  }
}

function canViewMessage(message, session, user) {
  if (!message || message.deleted_at) return false;
  const scope = String(message.visibility_scope || 'company');
  if (scope === 'company') return true;
  if (scope === 'department') {
    return Number(session?.department_id) > 0 && Number(session?.department_id) === Number(message.visibility_department_id);
  }
  if (scope === 'private') {
    return String(message.author_empid) === String(user?.empid) || String(message.visibility_empid) === String(user?.empid);
  }
  return false;
}

function sanitizeForViewer(message, session, user) {
  const viewerAllowed = canViewMessage(message, session, user);
  if (!viewerAllowed) return null;
  return {
    ...message,
    body: decryptBody(message),
  };
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

async function validateDbConnection(db = pool) {
  if (validatedDbConnections.has(db)) return;
  await db.query('SELECT 1');

  const placeholders = REQUIRED_MESSAGING_TABLES.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (${placeholders})`,
    REQUIRED_MESSAGING_TABLES,
  );
  const existingTables = new Set(rows.map((row) => String(row.table_name || '').toLowerCase()));
  const missingTables = REQUIRED_MESSAGING_TABLES.filter((table) => !existingTables.has(table.toLowerCase()));

  if (missingTables.length) {
    throw createError(
      500,
      'MESSAGING_SCHEMA_MISSING',
      'Messaging tables are missing. Run database migrations before using messaging features.',
      { missingTables },
    );
  }

  validatedDbConnections.add(db);
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
  const visibility = normalizeVisibility(payload, ctx.session, ctx.user);
  const encryptedBody = encryptBody(body);

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
      (company_id, author_empid, parent_message_id, linked_type, linked_id, visibility_scope, visibility_department_id, visibility_empid, body, body_ciphertext, body_iv, body_auth_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ctx.companyId,
      ctx.user.empid,
      parentMessageId,
      linkedType,
      linkedId,
      visibility.visibilityScope,
      visibility.visibilityDepartmentId,
      visibility.visibilityEmpid,
      encryptedBody.body,
      encryptedBody.bodyCiphertext,
      encryptedBody.bodyIv,
      encryptedBody.bodyAuthTag,
    ],
  );
  const messageId = result.insertId;
  await db.query(
    'INSERT INTO erp_message_idempotency (company_id, empid, idem_key, message_id) VALUES (?, ?, ?, ?)',
    [ctx.companyId, ctx.user.empid, idempotencyKey, messageId],
  );
  const message = await findMessageById(db, ctx.companyId, messageId);

  const viewerMessage = sanitizeForViewer(message, ctx.session, ctx.user);
  emit(ctx.companyId, eventName, {
    ...eventPayloadBase(ctx),
    message: viewerMessage,
    optimistic: {
      tempId: payload?.clientTempId ?? null,
      accepted: true,
      replay: false,
    },
  });

  return { message: viewerMessage, idempotentReplay: false };
}

export async function postMessage({ user, companyId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  await validateDbConnection(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throw createError(403, 'PERMISSION_DENIED', 'Messaging permission denied');
  const ctx = { user, companyId: scopedCompanyId, correlationId, session };
  return createMessageInternal({ db, ctx, payload, parentMessageId: null, eventName: 'message.created' });
}

export async function postReply({ user, companyId, messageId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  await validateDbConnection(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throw createError(403, 'PERMISSION_DENIED', 'Messaging permission denied');
  const message = await findMessageById(db, scopedCompanyId, messageId);
  if (!message || message.deleted_at) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');

  const ctx = { user, companyId: scopedCompanyId, correlationId, session };
  return createMessageInternal({
    db,
    ctx,
    payload: { ...payload, linkedType: message.linked_type, linkedId: message.linked_id },
    parentMessageId: message.id,
    eventName: 'thread.reply.created',
  });
}

export async function getMessages({ user, companyId, linkedType, linkedId, cursor, limit = CURSOR_PAGE_SIZE, correlationId, db = pool, getSession = getEmploymentSession }) {
  await validateDbConnection(db);
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

  const visibleRows = rows.map((row) => sanitizeForViewer(row, session, user)).filter(Boolean);
  const hasMore = visibleRows.length > parsedLimit;
  const pageRows = hasMore ? visibleRows.slice(0, parsedLimit) : visibleRows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;

  return {
    correlationId,
    items: pageRows,
    pageInfo: { nextCursor, hasMore },
    optimistic: { cursorEcho: cursorId ?? null },
  };
}

export async function getThread({ user, companyId, messageId, correlationId, db = pool, getSession = getEmploymentSession }) {
  await validateDbConnection(db);
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

  const scopedRows = rows.map((row) => sanitizeForViewer(row, session, user)).filter(Boolean);
  const visibleRoot = scopedRows.find((row) => row.id === root.id);
  if (!visibleRoot) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  return { correlationId, root: visibleRoot, replies: scopedRows.filter((row) => row.id !== root.id) };
}

export async function patchMessage({ user, companyId, messageId, payload, correlationId, db = pool, editWindowMs = DEFAULT_EDIT_WINDOW_MS, getSession = getEmploymentSession }) {
  await validateDbConnection(db);
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
  const encryptedBody = encryptBody(body);
  await db.query(
    'UPDATE erp_messages SET body = ?, body_ciphertext = ?, body_iv = ?, body_auth_tag = ? WHERE id = ? AND company_id = ?',
    [encryptedBody.body, encryptedBody.bodyCiphertext, encryptedBody.bodyIv, encryptedBody.bodyAuthTag, messageId, scopedCompanyId],
  );
  const updated = await findMessageById(db, scopedCompanyId, messageId);
  const view = sanitizeForViewer(updated, session, user);
  emit(scopedCompanyId, 'message.updated', { ...eventPayloadBase({ correlationId, companyId: scopedCompanyId }), message: view });
  return { correlationId, message: view };
}

export async function deleteMessage({ user, companyId, messageId, correlationId, db = pool, getSession = getEmploymentSession }) {
  await validateDbConnection(db);
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
  await validateDbConnection(db);
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
  await validateDbConnection(db);
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

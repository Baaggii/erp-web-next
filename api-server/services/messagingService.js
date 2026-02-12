import crypto from 'node:crypto';
import { pool, getEmploymentSession } from '../../db/index.js';
import { redisEval } from './redisClient.js';
import { evaluateMessagingPermission } from './messagingPermissionPolicy.js';
import { incRateLimitHits, observeMessageCreateLatency } from './messagingMetrics.js';

const DEFAULT_EDIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4000;
const CURSOR_PAGE_SIZE = 50;
const MAX_RATE_WINDOW_MS = 60_000;
const MAX_RATE_MESSAGES = 20;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REPLY_DEPTH = 5;
const LINKED_TYPE_ALLOWLIST = new Set(['transaction', 'plan', 'topic', 'task', 'ticket']);
const VISIBILITY_SCOPES = new Set(['company', 'department', 'private']);

const validatedMessagingSchemas = new WeakSet();
const idempotencyRequestHashSupport = new WeakMap();
const messageLinkedContextSupport = new WeakMap();
const messageEncryptionColumnSupport = new WeakMap();
const messageDeleteByColumnSupport = new WeakMap();
let ioRef = null;

const onlineByCompany = new Map();
const localRateWindows = new Map();
const localDuplicateWindows = new Map();
const RATE_LIMIT_REDIS_SCRIPT = `
local rateKey = KEYS[1]
local duplicateKey = KEYS[2]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxMessages = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', rateKey, '-inf', now - windowMs)
local count = redis.call('ZCARD', rateKey)
if count >= maxMessages then
  return {0, 1, 0}
end

if redis.call('SET', duplicateKey, member, 'NX', 'PX', windowMs) == false then
  return {0, 0, 1}
end

redis.call('ZADD', rateKey, now, member)
redis.call('PEXPIRE', rateKey, windowMs)
return {1, 0, 0}
`;

function createError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

async function insertSecurityAuditEvent(db, { event, userId, companyId, details }) {
  try {
    await db.query(
      'INSERT INTO security_audit_events (event, user_id, company_id, `timestamp`, details) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)',
      [event, userId ? String(userId) : null, toId(companyId), JSON.stringify(details ?? null)],
    );
  } catch {
    // keep request path resilient when audit table is not yet present
  }
}

function toId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nowIso() {
  return new Date().toISOString();
}

function computeRequestHash({ body, linkedType, linkedId, visibility, parentMessageId }) {
  const payload = {
    body,
    linkedType,
    linkedId,
    visibilityScope: visibility.visibilityScope,
    visibilityDepartmentId: visibility.visibilityDepartmentId,
    visibilityEmpid: visibility.visibilityEmpid,
    parentMessageId,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function eventPayloadBase(ctx) {
  return {
    correlationId: ctx.correlationId,
    companyId: ctx.companyId,
    at: nowIso(),
  };
}


function canUseLinkedColumns(db) {
  return messageLinkedContextSupport.get(db) !== false;
}

function canUseEncryptedBodyColumns(db) {
  return messageEncryptionColumnSupport.get(db) !== false;
}

function markLinkedColumnsUnsupported(db) {
  messageLinkedContextSupport.set(db, false);
}

function markEncryptedBodyColumnsUnsupported(db) {
  messageEncryptionColumnSupport.set(db, false);
}

function isUnknownColumnError(error, columnName) {
  const message = String(error?.sqlMessage || error?.message || '').toLowerCase();
  return message.includes('unknown column') && message.includes(String(columnName).toLowerCase());
}

async function readIdempotencyRow(db, { companyId, empid, idempotencyKey }) {
  const mode = idempotencyRequestHashSupport.get(db);
  if (mode !== false) {
    try {
      const [rows] = await db.query(
        `SELECT message_id, request_hash, expires_at
           FROM erp_message_idempotency
          WHERE company_id = ? AND empid = ? AND idem_key = ?
          LIMIT 1`,
        [companyId, empid, idempotencyKey],
      );
      idempotencyRequestHashSupport.set(db, true);
      return rows[0] || null;
    } catch (error) {
      if (!isUnknownColumnError(error, 'request_hash') && !isUnknownColumnError(error, 'expires_at')) throw error;
      idempotencyRequestHashSupport.set(db, false);
    }
  }

  try {
    const [rows] = await db.query(
      `SELECT message_id, expires_at
         FROM erp_message_idempotency
        WHERE company_id = ? AND empid = ? AND idem_key = ?
        LIMIT 1`,
      [companyId, empid, idempotencyKey],
    );
    return rows[0] ? { ...rows[0], request_hash: null } : null;
  } catch (error) {
    if (!isUnknownColumnError(error, 'expires_at')) throw error;
    const [rows] = await db.query(
      `SELECT message_id
         FROM erp_message_idempotency
        WHERE company_id = ? AND empid = ? AND idem_key = ?
        LIMIT 1`,
      [companyId, empid, idempotencyKey],
    );
    return rows[0] ? { ...rows[0], request_hash: null, expires_at: null } : null;
  }
}

async function upsertIdempotencyRow(db, { companyId, empid, idempotencyKey, messageId, requestHash, expiresAt }) {
  const mode = idempotencyRequestHashSupport.get(db);
  if (mode !== false) {
    try {
      await db.query(
        `INSERT INTO erp_message_idempotency (company_id, empid, idem_key, message_id, request_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           message_id = VALUES(message_id),
           request_hash = VALUES(request_hash),
           expires_at = VALUES(expires_at)`,
        [companyId, empid, idempotencyKey, messageId, requestHash, expiresAt],
      );
      idempotencyRequestHashSupport.set(db, true);
      return;
    } catch (error) {
      if (!isUnknownColumnError(error, 'request_hash') && !isUnknownColumnError(error, 'expires_at')) throw error;
      idempotencyRequestHashSupport.set(db, false);
    }
  }

  try {
    await db.query(
      `INSERT INTO erp_message_idempotency (company_id, empid, idem_key, message_id, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         message_id = VALUES(message_id),
         expires_at = VALUES(expires_at)`,
      [companyId, empid, idempotencyKey, messageId, expiresAt],
    );
    return;
  } catch (error) {
    if (!isUnknownColumnError(error, 'expires_at')) throw error;
  }

  await db.query(
    `INSERT INTO erp_message_idempotency (company_id, empid, idem_key, message_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       message_id = VALUES(message_id)`,
    [companyId, empid, idempotencyKey, messageId],
  );
}

async function markMessageDeleted(db, { companyId, messageId, empid }) {
  const mode = messageDeleteByColumnSupport.get(db);
  if (mode !== 'deleted_by' && mode !== 'none') {
    try {
      await db.query(
        'UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by_empid = ? WHERE id = ? AND company_id = ?',
        [empid, messageId, companyId],
      );
      messageDeleteByColumnSupport.set(db, 'deleted_by_empid');
      return;
    } catch (error) {
      if (!isUnknownColumnError(error, 'deleted_by_empid')) throw error;
      messageDeleteByColumnSupport.set(db, 'deleted_by');
    }
  }

  if (mode !== 'none') {
    try {
      await db.query(
        'UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ? AND company_id = ?',
        [empid, messageId, companyId],
      );
      messageDeleteByColumnSupport.set(db, 'deleted_by');
      return;
    } catch (error) {
      if (!isUnknownColumnError(error, 'deleted_by')) throw error;
      messageDeleteByColumnSupport.set(db, 'none');
    }
  }

  await db.query(
    'UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?',
    [messageId, companyId],
  );
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
  const recipients = Array.isArray(payload?.recipientEmpids)
    ? Array.from(new Set(payload.recipientEmpids.map((entry) => String(entry || '').trim()).filter(Boolean)))
    : [];

  const requestedScope = String(payload?.visibilityScope || '').trim().toLowerCase();
  const scope = requestedScope || (recipients.length > 0 ? 'private' : 'company');
  if (!VISIBILITY_SCOPES.has(scope)) {
    throw createError(400, 'VISIBILITY_SCOPE_INVALID', 'visibilityScope must be company, department, or private');
  }

  if (scope === 'private' && recipients.length > 1) {
    throw createError(400, 'VISIBILITY_PRIVATE_TOO_MANY_RECIPIENTS', 'Private messages support exactly one recipient');
  }

  const visibilityDepartmentId = scope === 'department' ? toId(payload?.visibilityDepartmentId ?? session?.department_id) : null;
  if (scope === 'department' && !visibilityDepartmentId) {
    throw createError(400, 'VISIBILITY_DEPARTMENT_REQUIRED', 'visibilityDepartmentId is required for department scope');
  }

  const visibilityEmpid = scope === 'private'
    ? String(payload?.visibilityEmpid || recipients[0] || '').trim()
    : null;
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

function enforceLocalRateLimitFallback({ companyId, empid, digest, now }) {
  const actorKey = `${companyId}:${empid}`;
  const window = localRateWindows.get(actorKey) || [];
  const prunedWindow = window.filter((timestamp) => now - timestamp < MAX_RATE_WINDOW_MS);
  if (prunedWindow.length >= MAX_RATE_MESSAGES) return [0, 1, 0];

  const duplicateKey = `${actorKey}:${digest}`;
  const duplicateExpiry = localDuplicateWindows.get(duplicateKey);
  if (duplicateExpiry && duplicateExpiry > now) return [0, 0, 1];

  prunedWindow.push(now);
  localRateWindows.set(actorKey, prunedWindow);
  localDuplicateWindows.set(duplicateKey, now + MAX_RATE_WINDOW_MS);
  return [1, 0, 0];
}

async function enforceRateLimit(companyId, empid, dedupeSeed, db = pool) {
  const now = Date.now();
  const member = `${now}:${crypto.randomUUID()}`;
  const dedupeInput = String(dedupeSeed || '').trim().toLowerCase();
  const digest = crypto.createHash('sha256').update(dedupeInput).digest('hex');
  const rateKey = `messaging:rate:${companyId}:${empid}`;
  const duplicateKey = `messaging:dedupe:${companyId}:${empid}:${digest}`;

  let result;
  try {
    result = await redisEval(
      RATE_LIMIT_REDIS_SCRIPT,
      [rateKey, duplicateKey],
      [String(now), String(MAX_RATE_WINDOW_MS), String(MAX_RATE_MESSAGES), member],
    );
  } catch {
    result = enforceLocalRateLimitFallback({ companyId, empid, digest, now });
  }

  if (!Array.isArray(result) || Number(result[0]) !== 1) {
    if (Number(result?.[2]) === 1) {
      incRateLimitHits({ reason: 'duplicate' });
      await insertSecurityAuditEvent(db, {
        event: 'messaging.rate_limit_hit',
        userId: empid,
        companyId,
        details: { reason: 'duplicate_message' },
      });
      throw createError(429, 'DUPLICATE_MESSAGE', 'Duplicate message detected');
    }
    incRateLimitHits({ reason: 'rate_limit' });
    await insertSecurityAuditEvent(db, {
      event: 'messaging.rate_limit_hit',
      userId: empid,
      companyId,
      details: { reason: 'rate_limited' },
    });
    throw createError(429, 'RATE_LIMITED', 'Too many messages in a short period');
  }
}

async function assertMessagingSchema(db = pool) {
  if (validatedMessagingSchemas.has(db)) return;
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'erp_messages'`,
  );
  if (!Number(rows?.[0]?.count)) {
    throw createError(
      503,
      'MESSAGING_SCHEMA_MISSING',
      'Messaging tables are missing. Run messaging migrations before using this service.',
    );
  }
  validatedMessagingSchemas.add(db);
}

async function resolveSession(user, companyId, getSession = getEmploymentSession) {
  const scopedCompanyId = toId(companyId) ?? toId(user?.companyId);
  if (!scopedCompanyId) throw createError(400, 'COMPANY_CONTEXT_INVALID', 'A valid companyId is required');
  const session = await getSession(user.empid, scopedCompanyId);
  if (!session) throw createError(403, 'COMPANY_MEMBERSHIP_REQUIRED', 'No active membership in company');
  return { scopedCompanyId, session };
}


function throwPermissionDenied({ db = pool, user, companyId, action, reason = 'insufficient_permissions' }) {
  void insertSecurityAuditEvent(db, {
    event: 'messaging.permission_denied',
    userId: user?.empid,
    companyId,
    details: { action, reason },
  });
  throw createError(403, 'PERMISSION_DENIED', 'Messaging permission denied', { action, reason });
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

function resolveMessagingRole(session) {
  if (session?.permissions?.system_settings) return 'Owner';
  if (session?.permissions?.messaging_admin) return 'Admin';
  if (session?.permissions?.messaging_delete) return 'Manager';
  return 'Staff';
}

function evaluatePermission({ action, user, companyId, session, resource = {}, policy = {} }) {
  const actor = {
    empid: user?.empid,
    companyId,
    departmentIds: session?.department_id ? [session.department_id] : [],
    projectIds: [],
  };
  return evaluateMessagingPermission({
    role: resolveMessagingRole(session),
    action,
    actor,
    resource: {
      companyId,
      ...resource,
    },
    policy,
  });
}

function assertPermission({ action, user, companyId, session, resource = {}, policy, db = pool }) {
  const evaluation = evaluatePermission({ action, user, companyId, session, resource, policy });
  if (!evaluation.allowed) {
    void insertSecurityAuditEvent(db, {
      event: 'messaging.permission_denied',
      userId: user?.empid,
      companyId,
      details: {
        action,
        reason: evaluation.reason,
      },
    });
    throw createError(403, 'PERMISSION_DENIED', 'Messaging permission denied', {
      action,
      reason: evaluation.reason,
    });
  }
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

async function resolveThreadDepth(db, companyId, message) {
  let depth = 0;
  let cursor = message;
  while (cursor?.parent_message_id) {
    depth += 1;
    if (depth > MAX_REPLY_DEPTH) return depth;
    cursor = await findMessageById(db, companyId, cursor.parent_message_id);
  }
  return depth;
}

function emit(companyId, eventName, payload) {
  if (!ioRef) return;
  ioRef.to(`company:${companyId}`).emit(eventName, payload);
}

function emitToEmpid(eventName, empid, payload) {
  if (!ioRef || !empid) return;
  const safe = String(empid || '').trim();
  if (!safe) return;
  ioRef.to(`user:${safe}`).emit(eventName, payload);
  ioRef.to(`user:${safe.toUpperCase()}`).emit(eventName, payload);
  ioRef.to(`emp:${safe}`).emit(eventName, payload);
}

function emitMessageScoped(ctx, eventName, message, optimistic) {
  if (!ioRef || !message) return;
  const payload = {
    ...eventPayloadBase(ctx),
    message,
    optimistic: optimistic || {
      tempId: null,
      accepted: true,
      replay: false,
    },
  };

  const scope = String(message.visibility_scope || 'company');
  if (scope === 'private') {
    emitToEmpid(eventName, message.author_empid, payload);
    emitToEmpid(eventName, message.visibility_empid, payload);
    return;
  }
  if (scope === 'department' && message.visibility_department_id) {
    ioRef.to(`department:${message.visibility_department_id}`).emit(eventName, payload);
    emitToEmpid(eventName, message.author_empid, payload);
    return;
  }
  emit(ctx.companyId, eventName, payload);
}

async function createMessageInternal({ db = pool, ctx, payload, parentMessageId = null, eventName = 'message.created' }) {
  const startedAt = process.hrtime.bigint();
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
  const requestHash = computeRequestHash({ body, linkedType, linkedId, visibility, parentMessageId });
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

  const existing = await readIdempotencyRow(db, {
    companyId: ctx.companyId,
    empid: ctx.user.empid,
    idempotencyKey,
  });
  if (existing) {
    const notExpired = !existing.expires_at || new Date(existing.expires_at).getTime() > Date.now();
    if (notExpired) {
      if (existing.request_hash && existing.request_hash !== requestHash) {
        throw createError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'idempotencyKey conflicts with a different request payload');
      }
      if (existing.message_id) {
        const existingMessage = await findMessageById(db, ctx.companyId, existing.message_id);
        if (existingMessage) {
          return { message: existingMessage, idempotentReplay: true };
        }
      }
    }
  }

  await enforceRateLimit(ctx.companyId, ctx.user.empid, idempotencyKey, db);

  const messageInsertValues = [
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
  ];

  let result;
  if (canUseLinkedColumns(db) && canUseEncryptedBodyColumns(db)) {
    try {
      [result] = await db.query(
        `INSERT INTO erp_messages
          (company_id, author_empid, parent_message_id, linked_type, linked_id, visibility_scope, visibility_department_id, visibility_empid, body, body_ciphertext, body_iv, body_auth_tag)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        messageInsertValues,
      );
      messageLinkedContextSupport.set(db, true);
      messageEncryptionColumnSupport.set(db, true);
    } catch (error) {
      const linkedUnsupported = isUnknownColumnError(error, 'linked_type') || isUnknownColumnError(error, 'linked_id');
      const encryptionUnsupported = isUnknownColumnError(error, 'body_ciphertext') || isUnknownColumnError(error, 'body_iv') || isUnknownColumnError(error, 'body_auth_tag');
      if (!linkedUnsupported && !encryptionUnsupported) throw error;
      if (linkedUnsupported) markLinkedColumnsUnsupported(db);
      if (encryptionUnsupported) markEncryptedBodyColumnsUnsupported(db);
    }
  }

  if (!result && canUseLinkedColumns(db)) {
    try {
      [result] = await db.query(
        `INSERT INTO erp_messages
          (company_id, author_empid, parent_message_id, linked_type, linked_id, visibility_scope, visibility_department_id, visibility_empid, body)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ctx.companyId,
          ctx.user.empid,
          parentMessageId,
          linkedType,
          linkedId,
          visibility.visibilityScope,
          visibility.visibilityDepartmentId,
          visibility.visibilityEmpid,
          body,
        ],
      );
      messageLinkedContextSupport.set(db, true);
    } catch (error) {
      if (!isUnknownColumnError(error, 'linked_type') && !isUnknownColumnError(error, 'linked_id')) throw error;
      markLinkedColumnsUnsupported(db);
    }
  }

  if (!result && canUseEncryptedBodyColumns(db)) {
    try {
      [result] = await db.query(
        `INSERT INTO erp_messages
          (company_id, author_empid, parent_message_id, body, body_ciphertext, body_iv, body_auth_tag)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          ctx.companyId,
          ctx.user.empid,
          parentMessageId,
          encryptedBody.body,
          encryptedBody.bodyCiphertext,
          encryptedBody.bodyIv,
          encryptedBody.bodyAuthTag,
        ],
      );
      messageEncryptionColumnSupport.set(db, true);
    } catch (error) {
      const encryptionUnsupported = isUnknownColumnError(error, 'body_ciphertext') || isUnknownColumnError(error, 'body_iv') || isUnknownColumnError(error, 'body_auth_tag');
      if (!encryptionUnsupported) throw error;
      markEncryptedBodyColumnsUnsupported(db);
    }
  }

  if (!result) {
    [result] = await db.query(
      `INSERT INTO erp_messages
        (company_id, author_empid, parent_message_id, body)
        VALUES (?, ?, ?, ?)`,
      [
        ctx.companyId,
        ctx.user.empid,
        parentMessageId,
        body,
      ],
    );
  }
  const messageId = result.insertId;
  await upsertIdempotencyRow(db, {
    companyId: ctx.companyId,
    empid: ctx.user.empid,
    idempotencyKey,
    messageId,
    requestHash,
    expiresAt,
  });
  const message = await findMessageById(db, ctx.companyId, messageId);

  const viewerMessage = sanitizeForViewer(message, ctx.session, ctx.user);
  emitMessageScoped(ctx, eventName, viewerMessage, {
    tempId: payload?.clientTempId ?? null,
    accepted: true,
    replay: false,
  });

  const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  observeMessageCreateLatency(elapsedSeconds, {
    companyId: String(ctx.companyId),
    status: 'success',
  });

  return { message: viewerMessage, idempotentReplay: false };
}

export async function postMessage({ user, companyId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  await assertMessagingSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertPermission({ action: 'message:create', user, companyId: scopedCompanyId, session, db });
  const ctx = { user, companyId: scopedCompanyId, correlationId, session };
  return createMessageInternal({ db, ctx, payload, parentMessageId: null, eventName: 'message.created' });
}

export async function postReply({ user, companyId, messageId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  await assertMessagingSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throwPermissionDenied({ db, user, companyId: scopedCompanyId, action: 'message:reply' });
  const message = await findMessageById(db, scopedCompanyId, messageId);
  if (!message || message.deleted_at) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  const depth = await resolveThreadDepth(db, scopedCompanyId, message);
  if (depth >= MAX_REPLY_DEPTH) {
    throw createError(400, 'THREAD_DEPTH_EXCEEDED', `Reply depth exceeds maximum of ${MAX_REPLY_DEPTH}`);
  }

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
  await assertMessagingSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throwPermissionDenied({ db, user, companyId: scopedCompanyId, action: 'message:list' });
  const parsedLimit = Math.min(Math.max(Number(limit) || CURSOR_PAGE_SIZE, 1), 100);
  const cursorId = toId(cursor);

  const filters = ['company_id = ?', 'parent_message_id IS NULL'];
  const params = [scopedCompanyId];
  if (linkedType && linkedId && canUseLinkedColumns(db)) {
    filters.push('linked_type = ?');
    filters.push('linked_id = ?');
    params.push(String(linkedType), String(linkedId));
  }
  if (cursorId) {
    filters.push('id < ?');
    params.push(cursorId);
  }
  filters.push('deleted_at IS NULL');

  let rows;
  try {
    [rows] = await db.query(
      `SELECT * FROM erp_messages WHERE ${filters.join(' AND ')} ORDER BY id DESC LIMIT ?`,
      [...params, parsedLimit + 1],
    );
  } catch (error) {
    if (!isUnknownColumnError(error, 'linked_type') && !isUnknownColumnError(error, 'linked_id')) throw error;
    markLinkedColumnsUnsupported(db);
    const fallbackFilters = filters.filter((entry) => entry !== 'linked_type = ?' && entry !== 'linked_id = ?');
    const fallbackParams = [scopedCompanyId];
    if (cursorId) fallbackParams.push(cursorId);
    [rows] = await db.query(
      `SELECT * FROM erp_messages WHERE ${fallbackFilters.join(' AND ')} ORDER BY id DESC LIMIT ?`,
      [...fallbackParams, parsedLimit + 1],
    );
  }

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
  await assertMessagingSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throwPermissionDenied({ db, user, companyId: scopedCompanyId, action: 'message:thread' });
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
  await assertMessagingSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  const message = await findMessageById(db, scopedCompanyId, messageId);
  if (!message || message.deleted_at) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  const moderator = canModerate(session);

  assertPermission({
    action: 'message:edit',
    user,
    companyId: scopedCompanyId,
    session,
    db,
    resource: {
      departmentId: message.visibility_department_id,
      linked: {
        type: message.linked_type,
        ownerEmpid: message.author_empid,
      },
    },
  });
  if (!moderator && message.author_empid !== user.empid) {
    throwPermissionDenied({ db, user, companyId: scopedCompanyId, action: 'message:edit', reason: 'cannot_edit_message' });
  }

  const createdAt = new Date(message.created_at).getTime();
  if (!moderator && Date.now() - createdAt > editWindowMs) {
    throw createError(409, 'EDIT_WINDOW_EXPIRED', 'Message edit window expired');
  }

  const body = sanitizeBody(payload?.body);
  const encryptedBody = encryptBody(body);
  if (canUseEncryptedBodyColumns(db)) {
    try {
      await db.query(
        'UPDATE erp_messages SET body = ?, body_ciphertext = ?, body_iv = ?, body_auth_tag = ? WHERE id = ? AND company_id = ?',
        [encryptedBody.body, encryptedBody.bodyCiphertext, encryptedBody.bodyIv, encryptedBody.bodyAuthTag, messageId, scopedCompanyId],
      );
      messageEncryptionColumnSupport.set(db, true);
    } catch (error) {
      const encryptionUnsupported = isUnknownColumnError(error, 'body_ciphertext') || isUnknownColumnError(error, 'body_iv') || isUnknownColumnError(error, 'body_auth_tag');
      if (!encryptionUnsupported) throw error;
      markEncryptedBodyColumnsUnsupported(db);
      await db.query(
        'UPDATE erp_messages SET body = ? WHERE id = ? AND company_id = ?',
        [body, messageId, scopedCompanyId],
      );
    }
  } else {
    await db.query(
      'UPDATE erp_messages SET body = ? WHERE id = ? AND company_id = ?',
      [body, messageId, scopedCompanyId],
    );
  }
  const updated = await findMessageById(db, scopedCompanyId, messageId);
  const view = sanitizeForViewer(updated, session, user);
  emit(scopedCompanyId, 'message.updated', { ...eventPayloadBase({ correlationId, companyId: scopedCompanyId }), message: view });
  return { correlationId, message: view };
}

export async function deleteMessage({ user, companyId, messageId, correlationId, db = pool, getSession = getEmploymentSession }) {
  await assertMessagingSchema(db);
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  const message = await findMessageById(db, scopedCompanyId, messageId);
  if (!message || message.deleted_at) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');

  const deleteEvaluation = evaluatePermission({
    action: 'message:delete',
    user,
    companyId: scopedCompanyId,
    session,
    resource: {
      departmentId: message.visibility_department_id,
      linked: {
        type: message.linked_type,
        ownerEmpid: message.author_empid,
      },
    },
  });
  if (!deleteEvaluation.allowed && !canDelete(session) && message.author_empid !== user.empid) {
    throwPermissionDenied({ db, user, companyId: scopedCompanyId, action: 'message:delete', reason: deleteEvaluation.reason || 'cannot_delete_message' });
  }

  await markMessageDeleted(db, { companyId: scopedCompanyId, messageId, empid: user.empid });
  emit(scopedCompanyId, 'message.deleted', {
    ...eventPayloadBase({ correlationId, companyId: scopedCompanyId }),
    messageId,
    deletedByEmpid: user.empid,
  });
  return { correlationId, messageId, deleted: true };
}

export async function presenceHeartbeat({ user, companyId, status = 'online', correlationId, db = pool, getSession = getEmploymentSession }) {
  await assertMessagingSchema(db);
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
  await assertMessagingSchema(db);
  const { scopedCompanyId } = await resolveSession(user, companyId, getSession);
  const ids = Array.from(new Set(String(userIds || '').split(',').map((entry) => entry.trim()).filter(Boolean)));
  if (!ids.length) return { companyId: scopedCompanyId, users: [] };

  const queryArgs = [scopedCompanyId, ...ids];
  const inClause = ids.map(() => '?').join(',');

  try {
    const [rows] = await db.query(
      `SELECT p.empid,
              p.status,
              p.heartbeat_at,
              COALESCE(e.emp_name, em.emp_name, p.empid) AS displayName,
              COALESCE(e.employee_code, e.emp_code, e.emp_id, em.employee_code, em.emp_code, em.emp_id, p.empid) AS employeeCode
         FROM erp_presence_heartbeats p
    LEFT JOIN tbl_employee e
           ON e.emp_id = p.empid
    LEFT JOIN tbl_employment em
           ON (em.emp_id = p.empid OR em.employment_emp_id = p.empid)
        WHERE p.company_id = ?
          AND p.empid IN (${inClause})`,
      queryArgs,
    );

    return { companyId: scopedCompanyId, users: rows };
  } catch (error) {
    if (!isUnknownColumnError(error, 'emp_name') && !isUnknownColumnError(error, 'employee_code') && !isUnknownColumnError(error, 'emp_code')) {
      throw error;
    }

    const [rows] = await db.query(
      `SELECT p.empid,
              p.status,
              p.heartbeat_at,
              p.empid AS displayName,
              p.empid AS employeeCode
         FROM erp_presence_heartbeats p
        WHERE p.company_id = ?
          AND p.empid IN (${inClause})`,
      queryArgs,
    );

    return { companyId: scopedCompanyId, users: rows };
  }
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

export async function getMessagingSocketAccess({ user, companyId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  if (!canMessage(session)) throwPermissionDenied({ db, user, companyId: scopedCompanyId, action: 'socket:connect' });
  return { scopedCompanyId, session };
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
      correlationId,
    },
  };
}

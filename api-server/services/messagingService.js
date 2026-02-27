import crypto from 'node:crypto';
import { pool, getEmploymentSession } from '../../db/index.js';

const MAX_MESSAGE_LENGTH = 4000;
const CURSOR_PAGE_SIZE = 50;
const MESSAGE_CLASS_ALLOWLIST = new Set(['general', 'financial', 'hr_sensitive', 'legal']);
const CONVERSATION_TYPE_ALLOWLIST = new Set(['general', 'private', 'linked']);

let ioRef = null;
const onlineByCompany = new Map();

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

function sanitizeBody(value) {
  const body = String(value ?? '').trim();
  if (!body) throw createError(400, 'MESSAGE_BODY_REQUIRED', 'Message body is required');
  if (body.length > MAX_MESSAGE_LENGTH) throw createError(400, 'MESSAGE_BODY_TOO_LONG', `Message body exceeds ${MAX_MESSAGE_LENGTH} characters`);
  return body;
}

function sanitizeTopic(value) {
  return topic ? topic.slice(0, 255) : null;
function sanitizeMessageClass(value) {
  const normalized = String(value ?? 'general').trim().toLowerCase() || 'general';
  if (!MESSAGE_CLASS_ALLOWLIST.has(normalized)) {
    throw createError(400, 'MESSAGE_CLASS_INVALID', 'messageClass must be one of: general, financial, hr_sensitive, legal');
  return normalized;
  if (!scopedCompanyId) throw createError(400, 'COMPANY_REQUIRED', 'companyId is required');
  const session = await getSession(user, scopedCompanyId);
  if (!session) throw createError(403, 'SESSION_NOT_FOUND', 'Employment session not found');
  const permissions = session?.permissions;
  if (permissions == null) return true;
  if (permissions === true) return true;
  if (typeof permissions.messaging === 'boolean') return permissions.messaging;
  return true;
function assertCanMessage(session) {
  if (!canMessage(session)) throw createError(403, 'FORBIDDEN', 'Messaging permission denied');
async function ensureGeneralConversation(db, companyId, empid) {
  const [rows] = await db.query(
    `SELECT * FROM erp_conversations
     WHERE company_id = ? AND type = 'general' AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 1`,
    [companyId],
  if (rows[0]) return rows[0];
  const [inserted] = await db.query(
    `INSERT INTO erp_conversations (company_id, type, created_by_empid)
     VALUES (?, 'general', ?)`,
    [companyId, String(empid || 'system')],
  );
  const [createdRows] = await db.query('SELECT * FROM erp_conversations WHERE id = ? LIMIT 1', [inserted.insertId]);
  return createdRows[0];
async function getConversationById(db, companyId, conversationId) {
  const [rows] = await db.query(
    'SELECT * FROM erp_conversations WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1',
    [conversationId, companyId],
async function isConversationParticipant(db, companyId, conversationId, empid) {
  const [rows] = await db.query(
    `SELECT 1 FROM erp_conversation_participants
     WHERE company_id = ? AND conversation_id = ? AND empid = ? AND left_at IS NULL
     LIMIT 1`,
    [companyId, conversationId, String(empid)],
  );
  return Boolean(rows[0]);
async function assertConversationAccess(db, companyId, conversation, empid) {
  if (!conversation) throw createError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  if (String(conversation.type) === 'general') return;
  const allowed = await isConversationParticipant(db, companyId, conversation.id, empid);
  if (!allowed) throw createError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
async function insertParticipants(db, companyId, conversationId, participants) {
  const unique = Array.from(new Set((participants || []).map((entry) => String(entry || '').trim()).filter(Boolean)));
  for (const empid of unique) {
    await db.query(
      `INSERT INTO erp_conversation_participants (conversation_id, company_id, empid, role)
       VALUES (?, ?, ?, 'member')
       ON DUPLICATE KEY UPDATE left_at = NULL`,
      [conversationId, companyId, empid],
    );
  return unique;
async function createMessage(db, { companyId, conversationId, authorEmpid, parentMessageId = null, body, topic, messageClass }) {
  const [inserted] = await db.query(
    `INSERT INTO erp_messages
      (company_id, conversation_id, author_empid, parent_message_id, body, topic, message_class)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [companyId, conversationId, authorEmpid, parentMessageId, body, topic, messageClass],
  );
  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? LIMIT 1', [inserted.insertId]);
  await db.query(
    `UPDATE erp_conversations
        SET last_message_id = ?,
            last_message_at = COALESCE(?, CURRENT_TIMESTAMP)
      WHERE id = ? AND company_id = ?`,
    [inserted.insertId, rows[0]?.created_at ?? null, conversationId, companyId],
  );
  return rows[0];
}
export async function createConversationRoot({ user, companyId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const type = String(payload?.type || 'private').trim().toLowerCase();
  if (!CONVERSATION_TYPE_ALLOWLIST.has(type) || type === 'general') {
    throw createError(400, 'CONVERSATION_TYPE_INVALID', 'type must be private or linked when creating a conversation');
  const sender = String(user?.empid || '').trim();
  if (!sender) throw createError(403, 'USER_EMPID_REQUIRED', 'User empid is required');
  const participantsInput = Array.isArray(payload?.participants) ? payload.participants : [];
  const participants = Array.from(new Set([sender, ...participantsInput.map((entry) => String(entry || '').trim()).filter(Boolean)]));
  if (type === 'private' && participants.length < 2) {
    throw createError(400, 'PARTICIPANTS_REQUIRED', 'Private conversation requires at least one participant besides sender');
  const linkedType = type === 'linked' ? String(payload?.linkedType || '').trim().slice(0, 64) || null : null;
  const linkedId = type === 'linked' ? String(payload?.linkedId || '').trim().slice(0, 128) || null : null;
  const [conversationInsert] = await db.query(
    `INSERT INTO erp_conversations (company_id, type, linked_type, linked_id, created_by_empid)
     VALUES (?, ?, ?, ?, ?)`,
    [scopedCompanyId, type, linkedType, linkedId, sender],
  );
  const conversationId = conversationInsert.insertId;
  await insertParticipants(db, scopedCompanyId, conversationId, participants);
  const message = await createMessage(db, {
    companyId: scopedCompanyId,
    conversationId,
    authorEmpid: sender,
    body: sanitizeBody(payload?.body),
    topic: sanitizeTopic(payload?.topic),
    messageClass: sanitizeMessageClass(payload?.messageClass ?? payload?.message_class),
  return {
    correlationId,
    conversation: { id: conversationId, company_id: scopedCompanyId, type, linked_type: linkedType, linked_id: linkedId },
    message,
  };
export async function postConversationMessage({ user, companyId, conversationId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  assertCanMessage(session);
  const normalizedConversationId = toId(conversationId ?? payload?.conversationId ?? payload?.conversation_id);
  if (!normalizedConversationId) throw createError(400, 'CONVERSATION_REQUIRED', 'conversationId is required');
  const conversation = await getConversationById(db, scopedCompanyId, normalizedConversationId);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);
  const parentMessageId = toId(payload?.parentMessageId ?? payload?.parent_message_id);
    const [parents] = await db.query(
      'SELECT id, conversation_id FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1',
      [parentMessageId, scopedCompanyId],
    );
    if (!parents[0] || Number(parents[0].conversation_id) !== normalizedConversationId) {
      throw createError(404, 'PARENT_MESSAGE_NOT_FOUND', 'Reply parent message not found in conversation');
  const message = await createMessage(db, {
    conversationId: normalizedConversationId,
    authorEmpid: String(user?.empid || ''),
    parentMessageId,
    body: sanitizeBody(payload?.body),
    topic: sanitizeTopic(payload?.topic),
    messageClass: sanitizeMessageClass(payload?.messageClass ?? payload?.message_class),
  return { correlationId, conversation: { id: normalizedConversationId }, message };
export async function postMessage({ user, companyId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  return postConversationMessage({ user, companyId, conversationId: payload?.conversationId ?? payload?.conversation_id, payload, correlationId, db, getSession });
export async function listConversations({ user, companyId, cursor, limit = CURSOR_PAGE_SIZE, correlationId, db = pool, getSession = getEmploymentSession }) {
  assertCanMessage(session);
  await ensureGeneralConversation(db, scopedCompanyId, user?.empid);

  const params = [scopedCompanyId, String(user?.empid || '')];
    cursorClause = 'AND c.id < ?';
    params.push(cursorId);
  params.push(parsedLimit + 1);

  const [rows] = await db.query(
    `SELECT c.*,
            (c.type = 'general') AS is_general
       FROM erp_conversations c
      WHERE c.company_id = ?
        AND c.deleted_at IS NULL
        AND (
          c.type = 'general'
          OR EXISTS (
            SELECT 1
              FROM erp_conversation_participants p
             WHERE p.company_id = c.company_id
               AND p.conversation_id = c.id
               AND p.empid = ?
               AND p.left_at IS NULL
          )
        )
        ${cursorClause}
      ORDER BY is_general DESC, c.last_message_at DESC, c.id DESC
    params,

  const hasMore = rows.length > parsedLimit;
  const items = hasMore ? rows.slice(0, parsedLimit) : rows;
  return { correlationId, items, pageInfo: { nextCursor: hasMore ? items[items.length - 1].id : null, hasMore } };
export async function getConversationMessages({ user, companyId, conversationId, cursor, limit = CURSOR_PAGE_SIZE, correlationId, db = pool, getSession = getEmploymentSession }) {
  assertCanMessage(session);
  const normalizedConversationId = toId(conversationId);
  if (!normalizedConversationId) throw createError(400, 'CONVERSATION_REQUIRED', 'conversationId is required');

  const conversation = await getConversationById(db, scopedCompanyId, normalizedConversationId);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);

  const [rows] = await db.query(
    `SELECT * FROM erp_messages
      WHERE company_id = ?
        AND conversation_id = ?
    cursorId
      ? [scopedCompanyId, normalizedConversationId, cursorId, parsedLimit + 1]
      : [scopedCompanyId, normalizedConversationId, parsedLimit + 1],
  const hasMore = rows.length > parsedLimit;
  const items = hasMore ? rows.slice(0, parsedLimit) : rows;
  return { correlationId, conversationId: normalizedConversationId, items, pageInfo: { nextCursor: hasMore ? items[items.length - 1].id : null, hasMore } };
export async function getMessages(args) {
  return listConversations(args);
  assertCanMessage(session);
  const id = toId(messageId);
  if (!id) throw createError(400, 'MESSAGE_ID_REQUIRED', 'messageId is required');
  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1', [id, scopedCompanyId]);
  if (!rows[0]) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  return getConversationMessages({ user, companyId: scopedCompanyId, conversationId: rows[0].conversation_id, correlationId, db, getSession: async () => session });
export async function postReply({ user, companyId, messageId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  assertCanMessage(session);
  const id = toId(messageId);
  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1', [id, scopedCompanyId]);
  if (!rows[0]) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  return postConversationMessage({ user, companyId: scopedCompanyId, conversationId: rows[0].conversation_id, payload: { ...payload, parentMessageId: id }, correlationId, db, getSession: async () => session });
}
export async function patchMessage({ user, companyId, messageId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const id = toId(messageId);
  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1', [id, scopedCompanyId]);
  const message = rows[0];
  if (!message) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  const conversation = await getConversationById(db, scopedCompanyId, message.conversation_id);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);
  if (String(message.author_empid) !== String(user?.empid)) throw createError(403, 'FORBIDDEN', 'Only the author can edit this message');

  const body = payload?.body != null ? sanitizeBody(payload.body) : message.body;
  const topic = payload?.topic !== undefined ? sanitizeTopic(payload.topic) : message.topic;
  const messageClass = payload?.messageClass || payload?.message_class
    ? sanitizeMessageClass(payload?.messageClass ?? payload?.message_class)
    : message.message_class;
  await db.query('UPDATE erp_messages SET body = ?, topic = ?, message_class = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?', [body, topic, messageClass, id, scopedCompanyId]);
  const [updated] = await db.query('SELECT * FROM erp_messages WHERE id = ? LIMIT 1', [id]);
  return { correlationId, message: updated[0] || null };
  assertCanMessage(session);
  const id = toId(messageId);
  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1', [id, scopedCompanyId]);
  const message = rows[0];
  if (!message) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  const conversation = await getConversationById(db, scopedCompanyId, message.conversation_id);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);
  if (String(message.author_empid) !== String(user?.empid)) throw createError(403, 'FORBIDDEN', 'Only the author can delete this message');
  await db.query('UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?', [id, scopedCompanyId]);
  return { correlationId, ok: true };
  markOnline(scopedCompanyId, user?.empid, status);
  return { correlationId, ok: true };
export async function getPresence({ user, companyId, userIds, getSession = getEmploymentSession }) {
  const companyState = onlineByCompany.get(String(scopedCompanyId)) || new Map();
  const ids = Array.isArray(userIds) ? userIds : String(userIds || '').split(',');
  const items = ids.map((entry) => String(entry || '').trim()).filter(Boolean).map((empid) => ({ empid, online: companyState.has(empid) }));
  return { items };
  const { scopedCompanyId } = await resolveSession(user, companyId, getSession);
  return { companyId: scopedCompanyId };
export async function getMessagingSocketAccess({ user, companyId, getSession = getEmploymentSession }) {
  return { allowed: canMessage(session), companyId: scopedCompanyId };
export function markOnline(companyId, empid, status = 'online') {
  const key = String(companyId);
  const map = onlineByCompany.get(key) || new Map();
  map.set(String(empid), { status, at: Date.now() });
  onlineByCompany.set(key, map);
  if (ioRef) ioRef.to(`messaging:${key}`).emit('presence.updated', { empid: String(empid), status });
  const key = String(companyId);
  const map = onlineByCompany.get(key);
  if (!map) return;
  map.delete(String(empid));
  if (ioRef) ioRef.to(`messaging:${key}`).emit('presence.updated', { empid: String(empid), status: 'offline' });
}

    status: Number(error?.status) || 500,
      details: error?.details,
  ioRef = null;
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

  const inClause = ids.map(() => '?').join(',');

  try {
    const [rows] = await queryWithTenantScope(
      db,
      'erp_presence_heartbeats',
      scopedCompanyId,
      `SELECT p.empid,
              p.status,
              p.heartbeat_at,
              COALESCE(e.emp_name, em.emp_name, p.empid) AS displayName,
              COALESCE(e.employee_code, e.emp_code, e.emp_id, em.employee_code, em.emp_code, em.emp_id, p.empid) AS employeeCode
         FROM {{table}} p
    LEFT JOIN tbl_employee e
           ON e.emp_id = p.empid
    LEFT JOIN tbl_employment em
           ON (em.emp_id = p.empid OR em.employment_emp_id = p.empid)
        WHERE p.empid IN (${inClause})`,
      ids,
    );

    return { companyId: scopedCompanyId, users: rows };
  } catch (error) {
    if (!isUnknownColumnError(error, 'emp_name') && !isUnknownColumnError(error, 'employee_code') && !isUnknownColumnError(error, 'emp_code')) {
      throw error;
    }

    const [rows] = await queryWithTenantScope(
      db,
      'erp_presence_heartbeats',
      scopedCompanyId,
      `SELECT p.empid,
              p.status,
              p.heartbeat_at,
              p.empid AS displayName,
              p.empid AS employeeCode
         FROM {{table}} p
        WHERE p.empid IN (${inClause})`,
      ids,
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


export function resetMessagingServiceStateForTests() {
  localRateWindows.clear();
  localDuplicateWindows.clear();
  onlineByCompany.clear();
}

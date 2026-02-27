import crypto from 'node:crypto';
import { pool, getEmploymentSession } from '../../db/index.js';

const MESSAGE_CLASS_ALLOWLIST = new Set(['general', 'financial', 'hr_sensitive', 'legal']);
const PRESENCE_ALLOWLIST = new Set(['online', 'away', 'offline']);
let ioRef = null;

function createError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function toId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
async function resolveSession(user, companyId, getSession = getEmploymentSession) {
  const scopedCompanyId = toId(companyId ?? user?.companyId);
  if (!scopedCompanyId) throw createError(400, 'INVALID_COMPANY_ID', 'companyId is required');
  const empid = sanitizeText(user?.empid ?? user?.emp_id ?? user?.id, 64);
  if (!empid) throw createError(401, 'UNAUTHORIZED', 'Employee session is required');
  let session = null;
    session = await getSession({ user, companyId: scopedCompanyId });
    session = null;
  return { scopedCompanyId, empid, session };
async function assertParticipant(db, companyId, conversationId, empid) {
    `SELECT 1
       FROM erp_conversation_participants
      WHERE company_id = ? AND conversation_id = ? AND empid = ? AND left_at IS NULL
      LIMIT 1`,
    [companyId, conversationId, empid],
  if (!rows.length) throw createError(403, 'FORBIDDEN', 'Conversation access denied');
async function hydrateParticipants(db, conversationIds = []) {
  if (!conversationIds.length) return new Map();
  const placeholders = conversationIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT conversation_id, empid, role, joined_at, left_at
       FROM erp_conversation_participants
      WHERE conversation_id IN (${placeholders}) AND left_at IS NULL`,
    conversationIds,
  const map = new Map();
  rows.forEach((row) => {
    const key = Number(row.conversation_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  return map;
async function ensureGeneralConversationForUser(db, companyId, empid) {
  const [rows] = await db.query(
    `SELECT id FROM erp_conversations WHERE company_id = ? AND type = 'general' AND deleted_at IS NULL LIMIT 1`,
    [companyId],
  let conversationId = rows[0]?.id ? Number(rows[0].id) : null;
  if (!conversationId) {
    const [created] = await db.query(
      `INSERT INTO erp_conversations (company_id, type, created_by_empid, last_message_at)
       VALUES (?, 'general', ?, CURRENT_TIMESTAMP)`,
      [companyId, empid],
    );
    conversationId = Number(created.insertId);
    `INSERT INTO erp_conversation_participants (conversation_id, company_id, empid, role)
     VALUES (?, ?, ?, 'member')
     ON DUPLICATE KEY UPDATE left_at = NULL`,
    [conversationId, companyId, empid],
  return conversationId;
function emit(companyId, event, payload) {
  ioRef?.to?.(`company:${companyId}`)?.emit?.(event, payload);
export async function listConversations({ user, companyId, limit = 50, db = pool, getSession = getEmploymentSession, correlationId }) {
  const { scopedCompanyId, empid } = await resolveSession(user, companyId, getSession);
  await ensureGeneralConversationForUser(db, scopedCompanyId, empid);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [rows] = await db.query(
    `SELECT c.*
       FROM erp_conversations c
       JOIN erp_conversation_participants p
         ON p.conversation_id = c.id
        AND p.company_id = c.company_id
      WHERE c.company_id = ?
        AND c.deleted_at IS NULL
        AND p.empid = ?
        AND p.left_at IS NULL
      ORDER BY (c.type = 'general') DESC, c.last_message_at DESC, c.id DESC
    [scopedCompanyId, empid, safeLimit],
  const ids = rows.map((r) => Number(r.id));
  const participantsMap = await hydrateParticipants(db, ids);
    items: rows.map((row) => ({
      ...row,
      participants: participantsMap.get(Number(row.id)) || [],
      is_general: row.type === 'general',
    })),
export async function createConversationRoot({ user, companyId, payload = {}, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, empid } = await resolveSession(user, companyId, getSession);
  const type = sanitizeText(payload.type || 'private', 32).toLowerCase();
  if (!['general', 'private', 'linked'].includes(type)) {
    throw createError(400, 'INVALID_TYPE', 'Conversation type must be general, private, or linked');
  const body = sanitizeText(payload.body, 4000);
  if (!body) throw createError(400, 'INVALID_BODY', 'Message body is required');
  const topic = sanitizeText(payload.topic, 255) || null;
  const messageClass = sanitizeText(payload.messageClass ?? payload.message_class ?? 'general', 64).toLowerCase();
  if (!MESSAGE_CLASS_ALLOWLIST.has(messageClass)) throw createError(400, 'INVALID_MESSAGE_CLASS', 'Invalid messageClass');
  const participantSet = new Set([empid]);
  (Array.isArray(payload.participants) ? payload.participants : []).forEach((entry) => {
    const normalized = sanitizeText(entry, 64);
    if (normalized) participantSet.add(normalized);
  if (type === 'private' && participantSet.size < 2) {
    throw createError(400, 'INVALID_PARTICIPANTS', 'Private conversation must include at least one participant besides sender');
  const linkedType = type === 'linked' ? (sanitizeText(payload.linkedType ?? payload.linked_type, 64) || null) : null;
  const linkedId = type === 'linked' ? (sanitizeText(payload.linkedId ?? payload.linked_id, 128) || null) : null;
  const conn = await db.getConnection();
    await conn.beginTransaction();
    const [conversationResult] = await conn.query(
      `INSERT INTO erp_conversations (company_id, type, linked_type, linked_id, created_by_empid, last_message_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [scopedCompanyId, type, linkedType, linkedId, empid],
    const conversationId = Number(conversationResult.insertId);

    for (const participant of participantSet) {
      await conn.query(
        `INSERT INTO erp_conversation_participants (conversation_id, company_id, empid, role)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE left_at = NULL`,
        [conversationId, scopedCompanyId, participant, participant === empid ? 'admin' : 'member'],
      );
    }
    const [messageResult] = await conn.query(
      `INSERT INTO erp_messages (company_id, conversation_id, author_empid, parent_message_id, body, topic, message_class)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      [scopedCompanyId, conversationId, empid, body, topic, messageClass],
    const messageId = Number(messageResult.insertId);
    await conn.query(
      'UPDATE erp_conversations SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?',
      [messageId, conversationId, scopedCompanyId],
    );
    await conn.commit();

    const [conversationRows] = await db.query('SELECT * FROM erp_conversations WHERE id = ? LIMIT 1', [conversationId]);
    const [messageRows] = await db.query('SELECT * FROM erp_messages WHERE id = ? LIMIT 1', [messageId]);
    const participantsMap = await hydrateParticipants(db, [conversationId]);
    const conversation = { ...conversationRows[0], participants: participantsMap.get(conversationId) || [] };
    const message = messageRows[0];
    emit(scopedCompanyId, 'conversation.created', { correlationId, conversation, message });
    return { correlationId, conversation, message };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function postConversationMessage({ user, companyId, conversationId, payload = {}, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, empid } = await resolveSession(user, companyId, getSession);
  const scopedConversationId = toId(conversationId ?? payload.conversation_id ?? payload.conversationId);
  if (!scopedConversationId) throw createError(400, 'INVALID_CONVERSATION_ID', 'conversationId is required');
  await assertParticipant(db, scopedCompanyId, scopedConversationId, empid);

  const body = sanitizeText(payload.body, 4000);
  if (!body) throw createError(400, 'INVALID_BODY', 'Message body is required');
  const topic = sanitizeText(payload.topic, 255) || null;
  const messageClass = sanitizeText(payload.messageClass ?? payload.message_class ?? 'general', 64).toLowerCase();
  if (!MESSAGE_CLASS_ALLOWLIST.has(messageClass)) throw createError(400, 'INVALID_MESSAGE_CLASS', 'Invalid messageClass');
  const parentMessageId = toId(payload.parentMessageId);

  const [messageResult] = await db.query(
    `INSERT INTO erp_messages (company_id, conversation_id, author_empid, parent_message_id, body, topic, message_class)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [scopedCompanyId, scopedConversationId, empid, parentMessageId, body, topic, messageClass],
  const messageId = Number(messageResult.insertId);
  await db.query(
    'UPDATE erp_conversations SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?',
    [messageId, scopedConversationId, scopedCompanyId],
  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? LIMIT 1', [messageId]);
  const message = rows[0];
  emit(scopedCompanyId, 'message.created', { correlationId, message });
  return { correlationId, message };
export async function getConversationMessages({ user, companyId, conversationId, limit = 100, db = pool, getSession = getEmploymentSession, correlationId }) {
  const { scopedCompanyId, empid } = await resolveSession(user, companyId, getSession);
  const scopedConversationId = toId(conversationId);
  if (!scopedConversationId) throw createError(400, 'INVALID_CONVERSATION_ID', 'conversationId is required');
  await assertParticipant(db, scopedCompanyId, scopedConversationId, empid);

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const [rows] = await db.query(
    `SELECT * FROM erp_messages
      WHERE company_id = ? AND conversation_id = ? AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT ?`,
    [scopedCompanyId, scopedConversationId, safeLimit],
  );
  return { correlationId, conversationId: scopedConversationId, items: rows };
  const { scopedCompanyId, empid } = await resolveSession(user, companyId, getSession);
  const scopedMessageId = toId(messageId);
  if (!scopedMessageId) throw createError(400, 'INVALID_MESSAGE_ID', 'messageId is required');
  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? LIMIT 1', [scopedMessageId, scopedCompanyId]);
  const message = rows[0];
  if (!message) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  await assertParticipant(db, scopedCompanyId, toId(message.conversation_id), empid);
  if (String(message.author_empid) !== String(empid)) throw createError(403, 'FORBIDDEN', 'Only author can delete message');
  await db.query('UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?', [scopedMessageId, scopedCompanyId]);
  emit(scopedCompanyId, 'message.deleted', { correlationId, messageId: scopedMessageId });
  return { correlationId, messageId: scopedMessageId, deleted: true };
}

export async function patchMessage({ user, companyId, messageId, payload = {}, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, empid } = await resolveSession(user, companyId, getSession);
  const scopedMessageId = toId(messageId);
  const body = sanitizeText(payload.body, 4000);
  if (!scopedMessageId || !body) throw createError(400, 'VALIDATION_ERROR', 'messageId and body are required');
  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? LIMIT 1', [scopedMessageId, scopedCompanyId]);
  const message = rows[0];
  if (!message) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  await assertParticipant(db, scopedCompanyId, toId(message.conversation_id), empid);
  if (String(message.author_empid) !== String(empid)) throw createError(403, 'FORBIDDEN', 'Only author can edit message');
  await db.query('UPDATE erp_messages SET body = ? WHERE id = ? AND company_id = ?', [body, scopedMessageId, scopedCompanyId]);
  const [updatedRows] = await db.query('SELECT * FROM erp_messages WHERE id = ? LIMIT 1', [scopedMessageId]);
  return { correlationId, message: updatedRows[0] };
  const { scopedCompanyId, empid } = await resolveSession(user, companyId, getSession);
  const scopedStatus = PRESENCE_ALLOWLIST.has(String(status).toLowerCase()) ? String(status).toLowerCase() : 'online';
    [scopedCompanyId, empid, scopedStatus],
  return { correlationId, empid, status: scopedStatus };
export async function getPresence({ user, companyId, userIds = '', db = pool, getSession = getEmploymentSession }) {
  const ids = Array.from(new Set(String(userIds).split(',').map((x) => sanitizeText(x, 64)).filter(Boolean)));
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT empid, status, heartbeat_at
       FROM erp_presence_heartbeats
      WHERE company_id = ? AND empid IN (${placeholders})`,
    [scopedCompanyId, ...ids],
  );
  return { companyId: scopedCompanyId, users: rows };
  const { scopedCompanyId, empid, session } = await resolveSession(user, companyId, getSession);
  return { companyId: scopedCompanyId, membership: { empid, branchId: session?.branch_id ?? null, departmentId: session?.department_id ?? null } };
export async function getMessagingSocketAccess({ user, companyId, getSession = getEmploymentSession }) {
export function createCorrelationId() { return crypto.randomUUID(); }
    status: error?.status || 500,
export function setMessagingIo(io) { ioRef = io; }
export function markOnline() {}
export function markOffline() {}
export function resetMessagingServiceStateForTests() {}
// Legacy wrappers kept only for internal tests/adapters still calling old names.
export const postMessage = createConversationRoot;
export const postReply = postConversationMessage;
export const getMessages = listConversations;
export const getThread = getConversationMessages;
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

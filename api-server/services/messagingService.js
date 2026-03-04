import crypto from 'node:crypto';
import { pool, getEmploymentSession } from '../../db/index.js';
import { enqueueWebPushNotification } from './webPushService.js';

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
  const topic = String(value ?? '').trim();
  return topic ? topic.slice(0, 255) : null;
}

function sanitizeMessageClass(value) {
  const normalized = String(value ?? 'general').trim().toLowerCase() || 'general';
  if (!MESSAGE_CLASS_ALLOWLIST.has(normalized)) {
    throw createError(400, 'MESSAGE_CLASS_INVALID', 'messageClass must be one of: general, financial, hr_sensitive, legal');
  }
  return normalized;
}

function sanitizeEmoji(value) {
  const emoji = String(value ?? '').trim();
  if (!emoji) throw createError(400, 'EMOJI_REQUIRED', 'emoji is required');
  if (emoji.length > 32) throw createError(400, 'EMOJI_INVALID', 'emoji is invalid');
  return emoji;
}

async function resolveSession(user, companyId, getSession = getEmploymentSession) {
  const scopedCompanyId = toId(companyId ?? user?.companyId);
  if (!scopedCompanyId) throw createError(400, 'COMPANY_REQUIRED', 'companyId is required');
  const session = await getSession(user?.empid, scopedCompanyId);
  if (!session) throw createError(403, 'SESSION_NOT_FOUND', 'Employment session not found');
  return { scopedCompanyId, session };
}

function canMessage(session) {
  const permissions = session?.permissions;
  if (permissions == null) return true;
  if (permissions === true) return true;
  if (typeof permissions.messaging === 'boolean') return permissions.messaging;
  return true;
}

function assertCanMessage(session) {
  if (!canMessage(session)) throw createError(403, 'FORBIDDEN', 'Messaging permission denied');
}

async function ensureGeneralConversation(db, companyId, empid) {
  const [rows] = await db.query(
    `SELECT * FROM erp_conversations
     WHERE company_id = ? AND type = 'general' AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 1`,
    [companyId],
  );
  if (rows[0]) return rows[0];
  const [inserted] = await db.query(
    `INSERT INTO erp_conversations (company_id, type, created_by_empid)
     VALUES (?, 'general', ?)`,
    [companyId, String(empid || 'system')],
  );
  const [createdRows] = await db.query('SELECT * FROM erp_conversations WHERE id = ? LIMIT 1', [inserted.insertId]);
  return createdRows[0];
}

async function getConversationById(db, companyId, conversationId) {
  const [rows] = await db.query(
    'SELECT * FROM erp_conversations WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1',
    [conversationId, companyId],
  );
  return rows[0] || null;
}

async function isConversationParticipant(db, companyId, conversationId, empid) {
  const [rows] = await db.query(
    `SELECT 1 FROM erp_conversation_participants
     WHERE company_id = ? AND conversation_id = ? AND empid = ? AND left_at IS NULL
     LIMIT 1`,
    [companyId, conversationId, String(empid)],
  );
  return Boolean(rows[0]);
}

async function assertConversationAccess(db, companyId, conversation, empid) {
  if (!conversation) throw createError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  if (String(conversation.type) === 'general') return;
  const allowed = await isConversationParticipant(db, companyId, conversation.id, empid);
  if (!allowed) throw createError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
}

async function insertParticipants(db, companyId, conversationId, participants) {
  const unique = Array.from(new Set((participants || []).map((entry) => String(entry || '').trim()).filter(Boolean)));
  for (const empid of unique) {
    await db.query(
      `INSERT INTO erp_conversation_participants (conversation_id, company_id, empid, role)
       VALUES (?, ?, ?, 'member')
       ON DUPLICATE KEY UPDATE left_at = NULL`,
      [conversationId, companyId, empid],
    );
  }
  return unique;
}


async function removeParticipant(db, companyId, conversationId, empid) {
  const normalizedEmpid = String(empid || '').trim();
  if (!normalizedEmpid) return false;
  const [result] = await db.query(
    `UPDATE erp_conversation_participants
        SET left_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
        AND conversation_id = ?
        AND empid = ?
        AND left_at IS NULL`,
    [companyId, conversationId, normalizedEmpid],
  );
  return Boolean(result?.affectedRows);
}

async function createMessage(db, { companyId, conversationId, authorEmpid, parentMessageId = null, body, messageClass }) {
  const [inserted] = await db.query(
    `INSERT INTO erp_messages
      (company_id, conversation_id, author_empid, parent_message_id, body, message_class)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [companyId, conversationId, authorEmpid, parentMessageId, body, messageClass],
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

function buildWebPushMessageText(body) {
  const normalized = String(body || '').trim();
  if (!normalized) return 'You have a new message';
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157)}...`;
}

async function enqueueConversationMessageWebPush({
  db,
  companyId,
  conversationId,
  conversationType,
  authorEmpid,
  messageBody,
  notifyWebPush = enqueueWebPushNotification,
}) {
  if (!notifyWebPush || !companyId || !conversationId) return;

  let recipientRows = [];
  if (String(conversationType || '').toLowerCase() === 'general') {
    const [employeeRows] = await db.query(
      `SELECT DISTINCT empid
         FROM users
        WHERE company_id = ?
          AND TRIM(COALESCE(empid, '')) <> ''`,
      [companyId],
    );
    recipientRows = employeeRows || [];
  } else {
    const [participantRows] = await db.query(
      `SELECT empid
         FROM erp_conversation_participants
        WHERE company_id = ?
          AND conversation_id = ?
          AND left_at IS NULL`,
      [companyId, conversationId],
    );
    recipientRows = participantRows || [];
  }

  const sender = String(authorEmpid || '').trim().toUpperCase();
  const recipients = new Set(
    recipientRows
      .map((row) => String(row?.empid || '').trim().toUpperCase())
      .filter((empid) => empid && empid !== sender),
  );

  for (const empid of recipients) {
    notifyWebPush({
      companyId,
      empid,
      kind: 'message',
      relatedId: conversationId,
      message: buildWebPushMessageText(messageBody),
      title: 'ERP message',
      url: '/#/',
    });
  }
}

export async function createConversationRoot({
  user,
  companyId,
  payload,
  correlationId,
  db = pool,
  getSession = getEmploymentSession,
  notifyWebPush = enqueueWebPushNotification,
}) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const type = String(payload?.type || 'private').trim().toLowerCase();
  if (!CONVERSATION_TYPE_ALLOWLIST.has(type) || type === 'general') {
    throw createError(400, 'CONVERSATION_TYPE_INVALID', 'type must be private or linked when creating a conversation');
  }
  const sender = String(user?.empid || '').trim();
  if (!sender) throw createError(403, 'USER_EMPID_REQUIRED', 'User empid is required');
  const participantsInput = Array.isArray(payload?.participants) ? payload.participants : [];
  const participants = Array.from(new Set([sender, ...participantsInput.map((entry) => String(entry || '').trim()).filter(Boolean)]));
  if (type === 'private' && participants.length < 2) {
    throw createError(400, 'PARTICIPANTS_REQUIRED', 'Private conversation requires at least one participant besides sender');
  }
  const linkedType = type === 'linked' ? String(payload?.linkedType || '').trim().slice(0, 64) || null : null;
  const linkedId = type === 'linked' ? String(payload?.linkedId || '').trim().slice(0, 128) || null : null;
  const topic = sanitizeTopic(payload?.topic);
  if (!topic) throw createError(400, 'TOPIC_REQUIRED', 'topic is required');
  const [conversationInsert] = await db.query(
    `INSERT INTO erp_conversations (company_id, type, topic, linked_type, linked_id, created_by_empid)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [scopedCompanyId, type, topic, linkedType, linkedId, sender],
  );
  const conversationId = conversationInsert.insertId;
  await insertParticipants(db, scopedCompanyId, conversationId, participants);
  const message = await createMessage(db, {
    companyId: scopedCompanyId,
    conversationId,
    authorEmpid: sender,
    body: sanitizeBody(payload?.body),
    messageClass: sanitizeMessageClass(payload?.messageClass ?? payload?.message_class),
  });
  await enqueueConversationMessageWebPush({
    db,
    companyId: scopedCompanyId,
    conversationId,
    conversationType: type,
    authorEmpid: sender,
    messageBody: message?.body,
    notifyWebPush,
  });
  return { correlationId, conversation: { id: conversationId, company_id: scopedCompanyId, type, topic, linked_type: linkedType, linked_id: linkedId }, message };
}

export async function postConversationMessage({
  user,
  companyId,
  conversationId,
  payload,
  correlationId,
  db = pool,
  getSession = getEmploymentSession,
  notifyWebPush = enqueueWebPushNotification,
}) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const normalizedConversationId = toId(conversationId ?? payload?.conversationId ?? payload?.conversation_id);
  if (!normalizedConversationId) throw createError(400, 'CONVERSATION_REQUIRED', 'conversationId is required');
  const conversation = await getConversationById(db, scopedCompanyId, normalizedConversationId);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);

  const parentMessageId = toId(payload?.parentMessageId ?? payload?.parent_message_id);
  if (parentMessageId) {
    const [parents] = await db.query(
      'SELECT * FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1',
      [parentMessageId, scopedCompanyId],
    );
    if (!parents[0] || Number(parents[0].conversation_id) !== normalizedConversationId) {
      throw createError(404, 'PARENT_MESSAGE_NOT_FOUND', 'Reply parent message not found in conversation');
    }
  }

  const message = await createMessage(db, {
    companyId: scopedCompanyId,
    conversationId: normalizedConversationId,
    authorEmpid: String(user?.empid || ''),
    parentMessageId,
    body: sanitizeBody(payload?.body),
    messageClass: sanitizeMessageClass(payload?.messageClass ?? payload?.message_class),
  });
  await enqueueConversationMessageWebPush({
    db,
    companyId: scopedCompanyId,
    conversationId: normalizedConversationId,
    conversationType: conversation?.type,
    authorEmpid: String(user?.empid || ''),
    messageBody: message?.body,
    notifyWebPush,
  });
  return { correlationId, conversation: { id: normalizedConversationId }, message };
}

export async function patchConversationTopic({ user, companyId, conversationId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const normalizedConversationId = toId(conversationId);
  if (!normalizedConversationId) throw createError(400, 'CONVERSATION_REQUIRED', 'conversationId is required');

  const conversation = await getConversationById(db, scopedCompanyId, normalizedConversationId);
  const isAdmin = user?.isAdmin === true || session?.isAdmin === true || session?.permissions?.isAdmin === true;
  if (!isAdmin) await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);
  if (String(conversation?.created_by_empid || '') !== String(user?.empid || '') && !isAdmin) {
    throw createError(403, 'FORBIDDEN', 'Only creator may edit topic');
  }

  const topic = sanitizeTopic(payload?.topic);
  if (!topic) throw createError(400, 'TOPIC_REQUIRED', 'topic is required');
  await db.query('UPDATE erp_conversations SET topic = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [topic, normalizedConversationId, scopedCompanyId]);

  if (ioRef) {
    ioRef
      .to(`company:${scopedCompanyId}`)
      .to(`messaging:${scopedCompanyId}`)
      .emit('conversation.updated', {
        conversation_id: normalizedConversationId,
        topic,
      });
  }
  return { correlationId, conversation: { id: normalizedConversationId, company_id: scopedCompanyId, topic } };
}

export async function addConversationParticipant({ user, companyId, conversationId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);

  const normalizedConversationId = toId(conversationId);
  if (!normalizedConversationId) throw createError(400, 'CONVERSATION_REQUIRED', 'conversationId is required');

  const conversation = await getConversationById(db, scopedCompanyId, normalizedConversationId);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);

  if (String(conversation?.type || '').toLowerCase() === 'general') {
    throw createError(400, 'GENERAL_CONVERSATION_IMMUTABLE', 'General conversation participants cannot be modified');
  }

  const participantEmpid = String(
    payload?.empid
    ?? payload?.participantEmpid
    ?? payload?.participant_empid
    ?? payload?.participantId
    ?? payload?.participant_id
    ?? payload?.userId
    ?? payload?.user_id
    ?? '',
  ).trim();
  if (!participantEmpid) throw createError(400, 'PARTICIPANT_REQUIRED', 'participant empid is required');

  await insertParticipants(db, scopedCompanyId, normalizedConversationId, [participantEmpid]);

  return {
    correlationId,
    conversation: { id: normalizedConversationId, company_id: scopedCompanyId },
    participant: { empid: participantEmpid },
  };
}



export async function removeConversationParticipant({ user, companyId, conversationId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);

  const normalizedConversationId = toId(conversationId);
  if (!normalizedConversationId) throw createError(400, 'CONVERSATION_REQUIRED', 'conversationId is required');

  const conversation = await getConversationById(db, scopedCompanyId, normalizedConversationId);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);

  if (String(conversation?.type || '').toLowerCase() === 'general') {
    throw createError(400, 'GENERAL_CONVERSATION_IMMUTABLE', 'General conversation participants cannot be modified');
  }

  const participantEmpid = String(
    payload?.empid
    ?? payload?.participantEmpid
    ?? payload?.participant_empid
    ?? payload?.participantId
    ?? payload?.participant_id
    ?? payload?.userId
    ?? payload?.user_id
    ?? '',
  ).trim();
  if (!participantEmpid) throw createError(400, 'PARTICIPANT_REQUIRED', 'participant empid is required');

  const removed = await removeParticipant(db, scopedCompanyId, normalizedConversationId, participantEmpid);
  if (!removed) throw createError(404, 'PARTICIPANT_NOT_FOUND', 'Participant not found in conversation');

  return {
    correlationId,
    conversation: { id: normalizedConversationId, company_id: scopedCompanyId },
    participant: { empid: participantEmpid },
    removed: true,
  };
}

export async function deleteConversation({ user, companyId, conversationId, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const normalizedConversationId = toId(conversationId);
  if (!normalizedConversationId) throw createError(400, 'CONVERSATION_REQUIRED', 'conversationId is required');

  const conversation = await getConversationById(db, scopedCompanyId, normalizedConversationId);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);
  if (String(conversation?.type) === 'general') {
    throw createError(400, 'GENERAL_CONVERSATION_PROTECTED', 'General conversation cannot be deleted');
  }

  const actorEmpid = String(user?.empid || '');
  const isCreator = String(conversation?.created_by_empid || '') === actorEmpid;
  if (!isCreator) throw createError(403, 'FORBIDDEN', 'Only the conversation creator can delete this conversation');

  await db.query(
    'UPDATE erp_conversations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ? AND deleted_at IS NULL',
    [normalizedConversationId, scopedCompanyId],
  );
  await db.query(
    'UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND company_id = ? AND deleted_at IS NULL',
    [normalizedConversationId, scopedCompanyId],
  );
  return { correlationId, ok: true, conversationId: normalizedConversationId };
}

export async function listConversations({ user, companyId, cursor, limit = CURSOR_PAGE_SIZE, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  await ensureGeneralConversation(db, scopedCompanyId, user?.empid);

  const parsedLimit = Math.min(Math.max(toId(limit) ?? CURSOR_PAGE_SIZE, 1), 200);
  const cursorId = toId(cursor);
  const params = [scopedCompanyId, String(user?.empid || '')];
  let cursorClause = '';
  if (cursorId) {
    cursorClause = 'AND c.id < ?';
    params.push(cursorId);
  }
  params.push(parsedLimit + 1);

  const [rows] = await db.query(
    `SELECT c.*,
            lm.body AS last_message_body,
            (c.type = 'general') AS is_general,
            (
              SELECT GROUP_CONCAT(p.empid ORDER BY p.empid SEPARATOR ',')
                FROM erp_conversation_participants p
               WHERE p.company_id = c.company_id
                 AND p.conversation_id = c.id
                 AND p.left_at IS NULL
            ) AS participant_empids
       FROM erp_conversations c
       LEFT JOIN erp_messages lm
         ON lm.id = c.last_message_id
        AND lm.company_id = c.company_id
        AND lm.deleted_at IS NULL
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
      LIMIT ?`,
    params,
  );

  const hasMore = rows.length > parsedLimit;
  const items = hasMore ? rows.slice(0, parsedLimit) : rows;
  return { correlationId, items, pageInfo: { nextCursor: hasMore ? items[items.length - 1].id : null, hasMore } };
}

export async function getConversationMessages({ user, companyId, conversationId, cursor, limit = CURSOR_PAGE_SIZE, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const normalizedConversationId = toId(conversationId);
  if (!normalizedConversationId) throw createError(400, 'CONVERSATION_REQUIRED', 'conversationId is required');

  const conversation = await getConversationById(db, scopedCompanyId, normalizedConversationId);
  await assertConversationAccess(db, scopedCompanyId, conversation, user?.empid);

  const parsedLimit = Math.min(Math.max(toId(limit) ?? CURSOR_PAGE_SIZE, 1), 200);
  const cursorId = toId(cursor);
  const [rows] = await db.query(
    `SELECT * FROM erp_messages
      WHERE company_id = ?
        AND conversation_id = ?
        ${cursorId ? 'AND id < ?' : ''}
      ORDER BY id DESC
      LIMIT ?`,
    cursorId
      ? [scopedCompanyId, normalizedConversationId, cursorId, parsedLimit + 1]
      : [scopedCompanyId, normalizedConversationId, parsedLimit + 1],
  );

  const hasMore = rows.length > parsedLimit;
  const items = hasMore ? rows.slice(0, parsedLimit) : rows;

  const viewerEmpid = String(user?.empid || '').trim();
  const readableMessageIds = items
    .filter((row) => !row?.deleted_at)
    .filter((row) => String(row?.author_empid || '') !== viewerEmpid)
    .map((row) => toId(row?.id))
    .filter(Boolean);

  if (viewerEmpid && readableMessageIds.length > 0) {
    const valuesPlaceholders = readableMessageIds.map(() => '(?, ?, CURRENT_TIMESTAMP)').join(', ');
    const params = readableMessageIds.flatMap((messageId) => [messageId, viewerEmpid]);
    await db.query(
      `INSERT IGNORE INTO erp_message_reads (message_id, empid, read_at)
       VALUES ${valuesPlaceholders}`,
      params,
    );
  }

  const messageIds = items.map((row) => toId(row?.id)).filter(Boolean);
  let readByMap = new Map();
  if (messageIds.length > 0) {
    const readPlaceholders = messageIds.map(() => '?').join(', ');
    const [readRows] = await db.query(
      `SELECT message_id, empid
         FROM erp_message_reads
        WHERE message_id IN (${readPlaceholders})`,
      messageIds,
    );
    readByMap = new Map();
    (readRows || []).forEach((row) => {
      const messageId = toId(row?.message_id);
      const empid = String(row?.empid || '').trim();
      if (!messageId || !empid) return;
      if (!readByMap.has(messageId)) readByMap.set(messageId, new Set());
      readByMap.get(messageId).add(empid);
    });
  }

  let reactionsByMessage = new Map();
  if (messageIds.length > 0) {
    const reactionPlaceholders = messageIds.map(() => '?').join(', ');
    const [reactionRows] = await db.query(
      `SELECT message_id, emoji, empid
         FROM erp_message_reactions
        WHERE company_id = ?
          AND message_id IN (${reactionPlaceholders})
          AND deleted_at IS NULL
        ORDER BY message_id ASC, emoji ASC, reacted_at ASC`,
      [scopedCompanyId, ...messageIds],
    );

    reactionsByMessage = new Map();
    for (const row of reactionRows || []) {
      const messageId = toId(row?.message_id);
      const emoji = String(row?.emoji || '').trim();
      const empid = String(row?.empid || '').trim();
      if (!messageId || !emoji || !empid) continue;
      if (!reactionsByMessage.has(messageId)) reactionsByMessage.set(messageId, new Map());
      const byEmoji = reactionsByMessage.get(messageId);
      if (!byEmoji.has(emoji)) byEmoji.set(emoji, new Set());
      byEmoji.get(emoji).add(empid);
    }
  }

  const itemsWithReads = items.map((row) => {
    const messageId = toId(row?.id);
    const isDeleted = Boolean(row?.deleted_at);
    const readBy = isDeleted ? [] : Array.from(readByMap.get(messageId) || []);
    const byEmoji = isDeleted ? new Map() : (reactionsByMessage.get(messageId) || new Map());
    const reactions = Array.from(byEmoji.entries()).map(([emoji, users]) => ({ emoji, count: users.size, users: Array.from(users) }));
    return {
      ...row,
      body: isDeleted ? '' : row?.body,
      read_by: readBy,
      reactions,
    };
  });

  return {
    correlationId,
    conversationId: normalizedConversationId,
    items: itemsWithReads,
    pageInfo: { nextCursor: hasMore ? items[items.length - 1].id : null, hasMore },
  };
}

async function getAccessibleMessageForReaction({ user, companyId, messageId, db }) {
  const id = toId(messageId);
  if (!id) throw createError(400, 'MESSAGE_REQUIRED', 'messageId is required');

  const [rows] = await db.query('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1', [id, companyId]);
  const message = rows[0];
  if (!message) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  const conversation = await getConversationById(db, companyId, message.conversation_id);
  await assertConversationAccess(db, companyId, conversation, user?.empid);
  return { id, message };
}

export async function addMessageReaction({ user, companyId, messageId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const emoji = sanitizeEmoji(payload?.emoji);
  const actorEmpid = String(user?.empid || '').trim();
  if (!actorEmpid) throw createError(403, 'USER_EMPID_REQUIRED', 'Authenticated user empid is required');
  const { id } = await getAccessibleMessageForReaction({ user, companyId: scopedCompanyId, messageId, db });

  await db.query(
    `INSERT INTO erp_message_reactions (message_id, company_id, empid, emoji)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE deleted_at = NULL, reacted_at = CURRENT_TIMESTAMP`,
    [id, scopedCompanyId, actorEmpid, emoji],
  );
  return { correlationId, ok: true, messageId: id, emoji, reacted: true };
}

export async function removeMessageReaction({ user, companyId, messageId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const emoji = sanitizeEmoji(payload?.emoji);
  const actorEmpid = String(user?.empid || '').trim();
  if (!actorEmpid) throw createError(403, 'USER_EMPID_REQUIRED', 'Authenticated user empid is required');
  const { id } = await getAccessibleMessageForReaction({ user, companyId: scopedCompanyId, messageId, db });

  await db.query(
    `UPDATE erp_message_reactions
        SET deleted_at = CURRENT_TIMESTAMP
      WHERE message_id = ? AND company_id = ? AND empid = ? AND emoji = ? AND deleted_at IS NULL`,
    [id, scopedCompanyId, actorEmpid, emoji],
  );
  return { correlationId, ok: true, messageId: id, emoji, reacted: false };
}

export async function toggleMessageReaction({ user, companyId, messageId, payload, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  assertCanMessage(session);
  const emoji = sanitizeEmoji(payload?.emoji);
  const actorEmpid = String(user?.empid || '').trim();
  if (!actorEmpid) throw createError(403, 'USER_EMPID_REQUIRED', 'Authenticated user empid is required');
  const { id } = await getAccessibleMessageForReaction({ user, companyId: scopedCompanyId, messageId, db });

  const [rows] = await db.query(
    `SELECT deleted_at
       FROM erp_message_reactions
      WHERE message_id = ? AND company_id = ? AND empid = ? AND emoji = ?
      LIMIT 1`,
    [id, scopedCompanyId, actorEmpid, emoji],
  );
  const existing = rows[0];
  const reacted = !existing || existing.deleted_at != null;
  if (reacted) {
    await db.query(
      `INSERT INTO erp_message_reactions (message_id, company_id, empid, emoji)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE deleted_at = NULL, reacted_at = CURRENT_TIMESTAMP`,
      [id, scopedCompanyId, actorEmpid, emoji],
    );
  } else {
    await db.query(
      `UPDATE erp_message_reactions
          SET deleted_at = CURRENT_TIMESTAMP
        WHERE message_id = ? AND company_id = ? AND empid = ? AND emoji = ? AND deleted_at IS NULL`,
      [id, scopedCompanyId, actorEmpid, emoji],
    );
  }
  return { correlationId, ok: true, messageId: id, emoji, reacted };
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
  const messageClass = payload?.messageClass || payload?.message_class
    ? sanitizeMessageClass(payload?.messageClass ?? payload?.message_class)
    : message.message_class;
  await db.query('UPDATE erp_messages SET body = ?, message_class = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?', [body, messageClass, id, scopedCompanyId]);
  const [updated] = await db.query('SELECT * FROM erp_messages WHERE id = ? LIMIT 1', [id]);
  return { correlationId, message: updated[0] || null };
}

export async function deleteMessage({ user, companyId, messageId, correlationId, db = pool, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
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
}

export async function presenceHeartbeat({ user, companyId, status = 'online', correlationId, getSession = getEmploymentSession }) {
  const { scopedCompanyId } = await resolveSession(user, companyId, getSession);
  if (status === 'offline') markOffline(scopedCompanyId, user?.empid);
  else markOnline(scopedCompanyId, user?.empid, status);
  return { correlationId, ok: true };
}

export async function getPresence({ user, companyId, userIds, getSession = getEmploymentSession }) {
  const { scopedCompanyId } = await resolveSession(user, companyId, getSession);
  const companyState = onlineByCompany.get(String(scopedCompanyId)) || new Map();
  const ids = Array.isArray(userIds) ? userIds : String(userIds || '').split(',');
  const items = ids.map((entry) => String(entry || '').trim()).filter(Boolean).map((empid) => ({ empid, online: companyState.has(empid) }));
  return { items };
}

export async function switchCompanyContext({ user, companyId, getSession = getEmploymentSession }) {
  const { scopedCompanyId } = await resolveSession(user, companyId, getSession);
  return { companyId: scopedCompanyId };
}

export async function getMessagingSocketAccess({ user, companyId, getSession = getEmploymentSession }) {
  const { scopedCompanyId, session } = await resolveSession(user, companyId, getSession);
  return {
    allowed: canMessage(session),
    companyId: scopedCompanyId,
    scopedCompanyId,
    session,
  };
}

export function setMessagingIo(io) { ioRef = io; }

export function markOnline(companyId, empid, status = 'online') {
  const key = String(companyId);
  const map = onlineByCompany.get(key) || new Map();
  map.set(String(empid), { status, at: Date.now() });
  onlineByCompany.set(key, map);
  if (ioRef) ioRef.to(`messaging:${key}`).emit('presence.updated', { empid: String(empid), status });
}

export function markOffline(companyId, empid) {
  const key = String(companyId);
  const map = onlineByCompany.get(key);
  if (!map) return;
  map.delete(String(empid));
  if (ioRef) ioRef.to(`messaging:${key}`).emit('presence.updated', { empid: String(empid), status: 'offline' });
}

export function createCorrelationId() { return crypto.randomUUID(); }

export function toStructuredError(error, correlationId) {
  return {
    status: Number(error?.status) || 500,
    error: {
      code: error?.code || 'INTERNAL_ERROR',
      message: error?.message || 'Internal server error',
      correlationId,
      details: error?.details,
    },
  };
}

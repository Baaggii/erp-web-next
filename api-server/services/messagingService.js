import { pool, getEmploymentSession } from '../../db/index.js';

let initialized = false;
let ioRef = null;
const onlineByCompany = new Map();
const recentMessagesByUser = new Map();

const MAX_REPLY_DEPTH = 5;
const MESSAGE_RATE_LIMIT_WINDOW_MS = 60_000;
const MESSAGE_RATE_LIMIT_MAX_PER_WINDOW = 20;
const DUPLICATE_MESSAGE_WINDOW_MS = 10_000;

function toId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function canModerate(session) {
  return Boolean(session?.permissions?.system_settings || session?.permissions?.messaging_admin);
}

function canSend(session) {
  return canModerate(session) || session?.permissions?.messaging !== false;
}

async function ensureSchema() {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      company_id BIGINT UNSIGNED NOT NULL,
      author_empid VARCHAR(64) NOT NULL,
      parent_message_id BIGINT UNSIGNED NULL,
      body TEXT NOT NULL,
      topic VARCHAR(255) NULL,
      transaction_id VARCHAR(128) NULL,
      plan_id VARCHAR(128) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_erp_messages_company_created (company_id, created_at),
      KEY idx_erp_messages_parent (parent_message_id),
      KEY idx_erp_messages_author (author_empid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_message_recipients (
      message_id BIGINT UNSIGNED NOT NULL,
      recipient_empid VARCHAR(64) NOT NULL,
      PRIMARY KEY (message_id, recipient_empid),
      KEY idx_erp_message_recipients_emp (recipient_empid),
      CONSTRAINT fk_erp_message_recipients_message
        FOREIGN KEY (message_id) REFERENCES erp_messages(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  initialized = true;
}

async function resolveContext(user, explicitCompanyId) {
  const companyId = toId(explicitCompanyId) ?? toId(user?.companyId);
  if (!companyId) throw Object.assign(new Error('Invalid company context'), { status: 400 });
  const session = await getEmploymentSession(user.empid, companyId);
  if (!session) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return { companyId, session };
}

function listOnline(companyId) {
  return Array.from(onlineByCompany.get(companyId) || []);
}

function countLinks({ topic, transactionId, planId }) {
  return [topic, transactionId, planId].filter(Boolean).length;
}

function enforceRootLinkConstraint({ topic, transactionId, planId, parentMessageId }) {
  if (parentMessageId) return;
  const links = countLinks({ topic, transactionId, planId });
  if (links !== 1) {
    throw Object.assign(
      new Error('Exactly one root message link is required: topic, transactionId, or planId'),
      { status: 400 },
    );
  }
}

async function resolveReplyDepth({ parentMessageId, scopedCompanyId }) {
  if (!parentMessageId) return null;
  const [rows] = await pool.query(
    `WITH RECURSIVE message_chain AS (
       SELECT id, parent_message_id, 1 AS depth
         FROM erp_messages
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT m.id, m.parent_message_id, message_chain.depth + 1 AS depth
         FROM erp_messages m
         JOIN message_chain ON m.id = message_chain.parent_message_id
        WHERE m.company_id = ? AND m.deleted_at IS NULL
     )
     SELECT id, parent_message_id, depth
       FROM message_chain
      ORDER BY depth DESC
      LIMIT 1`,
    [parentMessageId, scopedCompanyId, scopedCompanyId],
  );
  if (!rows.length) throw Object.assign(new Error('Parent message not found'), { status: 404 });
  const maxDepthFromParent = Number(rows[0].depth) || 1;
  if (maxDepthFromParent >= MAX_REPLY_DEPTH) {
    throw Object.assign(new Error(`Reply depth limit reached (${MAX_REPLY_DEPTH})`), { status: 400 });
  }
  return rows[0];
}

function enforceRateLimit({ scopedCompanyId, empid, body }) {
  const key = `${scopedCompanyId}:${empid}`;
  const now = Date.now();
  const history = recentMessagesByUser.get(key) || [];
  const recent = history.filter((entry) => now - entry.ts <= MESSAGE_RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MESSAGE_RATE_LIMIT_MAX_PER_WINDOW) {
    throw Object.assign(new Error('Rate limit exceeded for messaging'), { status: 429 });
  }

  const duplicate = recent.find(
    (entry) => entry.body === body && now - entry.ts <= DUPLICATE_MESSAGE_WINDOW_MS,
  );
  if (duplicate) {
    throw Object.assign(new Error('Duplicate message detected, please wait before sending again'), {
      status: 429,
    });
  }

  recent.push({ ts: now, body });
  recentMessagesByUser.set(key, recent);
}

export async function listMessages({ user, companyId, limit = 80 }) {
  await ensureSchema();
  const { companyId: scopedCompanyId, session } = await resolveContext(user, companyId);
  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const moderated = canModerate(session);

  const [rows] = await pool.query(
    `SELECT m.*
       FROM erp_messages m
      WHERE m.company_id = ?
        AND m.deleted_at IS NULL
        AND (
          ? = 1
          OR m.author_empid = ?
          OR EXISTS (
            SELECT 1
              FROM erp_message_recipients mr
             WHERE mr.message_id = m.id
               AND mr.recipient_empid = ?
          )
          OR NOT EXISTS (
            SELECT 1 FROM erp_message_recipients mr2 WHERE mr2.message_id = m.id
          )
        )
      ORDER BY m.created_at DESC
      LIMIT ?`,
    [scopedCompanyId, moderated ? 1 : 0, user.empid, user.empid, safeLimit],
  );

  const messageIds = rows.map((r) => r.id);
  let recipientsByMessage = new Map();
  if (messageIds.length) {
    const [recipientRows] = await pool.query(
      `SELECT message_id, recipient_empid
         FROM erp_message_recipients
        WHERE message_id IN (${messageIds.map(() => '?').join(',')})`,
      messageIds,
    );
    recipientsByMessage = recipientRows.reduce((acc, row) => {
      if (!acc.has(row.message_id)) acc.set(row.message_id, []);
      acc.get(row.message_id).push(row.recipient_empid);
      return acc;
    }, new Map());
  }

  return {
    companyId: scopedCompanyId,
    onlineUsers: listOnline(scopedCompanyId),
    messages: rows
      .map((row) => ({ ...row, recipients: recipientsByMessage.get(row.id) || [] }))
      .reverse(),
  };
}

export async function createMessage({ user, payload, companyId }) {
  await ensureSchema();
  const { companyId: scopedCompanyId, session } = await resolveContext(user, companyId);
  if (!canSend(session)) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const body = String(payload?.body || '').trim();
  if (!body) throw Object.assign(new Error('Message body is required'), { status: 400 });
  if (body.length > 4000) throw Object.assign(new Error('Message body is too long'), { status: 400 });

  const parentMessageId = toId(payload?.parentMessageId);
  const topic = payload?.topic ? String(payload.topic).trim().slice(0, 255) : null;
  const transactionId = payload?.transactionId ? String(payload.transactionId).trim().slice(0, 128) : null;
  const planId = payload?.planId ? String(payload.planId).trim().slice(0, 128) : null;
  const recipients = Array.isArray(payload?.recipientEmpids)
    ? Array.from(new Set(payload.recipientEmpids.map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 50)
    : [];

  enforceRootLinkConstraint({ topic, transactionId, planId, parentMessageId });
  await resolveReplyDepth({ parentMessageId, scopedCompanyId });
  enforceRateLimit({ scopedCompanyId, empid: user.empid, body });

  const [result] = await pool.query(
    `INSERT INTO erp_messages
      (company_id, author_empid, parent_message_id, body, topic, transaction_id, plan_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [scopedCompanyId, user.empid, parentMessageId, body, topic, transactionId, planId],
  );

  const messageId = result.insertId;
  if (recipients.length) {
    await pool.query(
      `INSERT INTO erp_message_recipients (message_id, recipient_empid)
       VALUES ${recipients.map(() => '(?, ?)').join(',')}`,
      recipients.flatMap((empid) => [messageId, empid]),
    );
  }

  const [rows] = await pool.query(`SELECT * FROM erp_messages WHERE id = ? LIMIT 1`, [messageId]);
  const created = { ...rows[0], recipients };

  if (ioRef) {
    ioRef.to(`company:${scopedCompanyId}`).emit('messages:new', created);
  }

  return created;
}

export function setMessagingIo(io) {
  ioRef = io;
}

export function markOnline(companyId, empid) {
  const scopedCompanyId = toId(companyId);
  if (!scopedCompanyId || !empid) return;
  if (!onlineByCompany.has(scopedCompanyId)) onlineByCompany.set(scopedCompanyId, new Set());
  onlineByCompany.get(scopedCompanyId).add(String(empid));
  if (ioRef) ioRef.to(`company:${scopedCompanyId}`).emit('messages:presence', { companyId: scopedCompanyId, onlineUsers: listOnline(scopedCompanyId) });
}

export function markOffline(companyId, empid) {
  const scopedCompanyId = toId(companyId);
  if (!scopedCompanyId || !empid) return;
  const set = onlineByCompany.get(scopedCompanyId);
  if (!set) return;
  set.delete(String(empid));
  if (set.size === 0) onlineByCompany.delete(scopedCompanyId);
  if (ioRef) ioRef.to(`company:${scopedCompanyId}`).emit('messages:presence', { companyId: scopedCompanyId, onlineUsers: listOnline(scopedCompanyId) });
}

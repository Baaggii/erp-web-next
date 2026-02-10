import { pool, getEmploymentSession, listUsersByCompany } from '../../db/index.js';

let initialized = false;
let ioRef = null;
const onlineByCompany = new Map();

function toId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeEmpid(value) {
  const text = String(value || '').trim();
  return text || null;
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
      transaction_table VARCHAR(128) NULL,
      transaction_row_id VARCHAR(128) NULL,
      transaction_label VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_erp_messages_company_created (company_id, created_at),
      KEY idx_erp_messages_parent (parent_message_id),
      KEY idx_erp_messages_author (author_empid),
      KEY idx_erp_messages_topic (company_id, topic)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const alterStatements = [
    'ALTER TABLE erp_messages ADD COLUMN transaction_table VARCHAR(128) NULL',
    'ALTER TABLE erp_messages ADD COLUMN transaction_row_id VARCHAR(128) NULL',
    'ALTER TABLE erp_messages ADD COLUMN transaction_label VARCHAR(255) NULL',
    'ALTER TABLE erp_messages ADD KEY idx_erp_messages_topic (company_id, topic)',
  ];
  for (const sql of alterStatements) {
    try {
      await pool.query(sql);
    } catch {
      // ignore if already exists
    }
  }

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

function buildMessageNodeMap(rows, recipientsByMessage) {
  const map = new Map();
  rows.forEach((row) => {
    map.set(row.id, {
      ...row,
      recipients: recipientsByMessage.get(row.id) || [],
      replies: [],
      root_id: row.parent_message_id || row.id,
    });
  });

  map.forEach((node) => {
    if (node.parent_message_id && map.has(node.parent_message_id)) {
      const parent = map.get(node.parent_message_id);
      node.root_id = parent.root_id || parent.id;
      parent.replies.push(node);
    }
  });
  return map;
}

function flattenMessagesInTimeOrder(rootNodes) {
  const out = [];
  const walk = (node) => {
    out.push(node);
    node.replies
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach(walk);
  };
  rootNodes
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach(walk);
  return out;
}

function visibleToUser(node, empid, moderated, rootParticipants) {
  if (moderated) return true;
  if (node.author_empid === empid) return true;
  if (node.recipients.includes(empid)) return true;
  if (node.recipients.length === 0 && rootParticipants.length === 0) return true;
  return rootParticipants.includes(empid);
}

export async function listCompanyPeople({ user, companyId }) {
  await ensureSchema();
  const { companyId: scopedCompanyId } = await resolveContext(user, companyId);
  const rows = await listUsersByCompany(scopedCompanyId);
  return {
    companyId: scopedCompanyId,
    onlineUsers: listOnline(scopedCompanyId),
    employees: (rows || []).map((row) => ({
      empid: normalizeEmpid(row.empid) || normalizeEmpid(row.emp_id) || normalizeEmpid(row.id),
      name: String(row.name || row.full_name || row.empid || row.emp_id || '').trim(),
    })).filter((row) => row.empid),
  };
}

export async function listMessages({ user, companyId, limit = 250 }) {
  await ensureSchema();
  const { companyId: scopedCompanyId, session } = await resolveContext(user, companyId);
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 1), 600);
  const moderated = canModerate(session);

  const [rows] = await pool.query(
    `SELECT *
       FROM (
         SELECT *
           FROM erp_messages
          WHERE company_id = ?
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ?
       ) recent
      ORDER BY created_at ASC`,
    [scopedCompanyId, safeLimit],
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

  const nodeMap = buildMessageNodeMap(rows, recipientsByMessage);
  const roots = [];
  nodeMap.forEach((node) => {
    if (!node.parent_message_id || !nodeMap.has(node.parent_message_id)) roots.push(node);
  });

  const visibleNodes = [];
  const topics = [];

  roots.forEach((root) => {
    const rootParticipants = Array.from(new Set([root.author_empid, ...(root.recipients || [])]));
    const flat = flattenMessagesInTimeOrder([root]);
    const perThreadVisible = flat.filter((node) => visibleToUser(node, user.empid, moderated, rootParticipants));
    if (!perThreadVisible.length) return;
    visibleNodes.push(...perThreadVisible);
    topics.push({
      rootMessageId: root.id,
      topic: String(root.topic || 'Untitled topic').trim() || 'Untitled topic',
      createdAt: root.created_at,
      lastMessageAt: perThreadVisible[perThreadVisible.length - 1]?.created_at || root.created_at,
      participants: rootParticipants,
      transaction: root.transaction_id
        ? {
            id: root.transaction_id,
            table: root.transaction_table || null,
            rowId: root.transaction_row_id || null,
            label: root.transaction_label || null,
          }
        : null,
    });
  });

  visibleNodes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return {
    companyId: scopedCompanyId,
    onlineUsers: listOnline(scopedCompanyId),
    topics: topics.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()),
    messages: visibleNodes,
  };
}

async function resolveThreadParticipants(messageId) {
  const [msgRows] = await pool.query(
    `SELECT id, author_empid, parent_message_id FROM erp_messages WHERE id = ? LIMIT 1`,
    [messageId],
  );
  if (!msgRows.length) return [];

  let cursor = msgRows[0];
  while (cursor.parent_message_id) {
    const [rows] = await pool.query(
      `SELECT id, author_empid, parent_message_id FROM erp_messages WHERE id = ? LIMIT 1`,
      [cursor.parent_message_id],
    );
    if (!rows.length) break;
    cursor = rows[0];
  }

  const rootId = cursor.id;
  const [recipientRows] = await pool.query(
    `SELECT recipient_empid FROM erp_message_recipients WHERE message_id = ?`,
    [rootId],
  );
  return Array.from(new Set([cursor.author_empid, ...recipientRows.map((r) => r.recipient_empid)]));
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
  const transactionTable = payload?.transaction?.table ? String(payload.transaction.table).trim().slice(0, 128) : null;
  const transactionRowId = payload?.transaction?.rowId ? String(payload.transaction.rowId).trim().slice(0, 128) : null;
  const transactionLabel = payload?.transaction?.label ? String(payload.transaction.label).trim().slice(0, 255) : null;
  let recipients = Array.isArray(payload?.recipientEmpids)
    ? Array.from(new Set(payload.recipientEmpids.map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 80)
    : [];

  if (parentMessageId) {
    const [parentRows] = await pool.query(
      `SELECT id, topic FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1`,
      [parentMessageId, scopedCompanyId],
    );
    if (!parentRows.length) throw Object.assign(new Error('Parent message not found'), { status: 404 });
    const participants = await resolveThreadParticipants(parentMessageId);
    if (participants.length && !participants.includes(user.empid) && !canModerate(session)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    if (!recipients.length) recipients = participants.filter((empid) => empid !== user.empid);
  }

  const [result] = await pool.query(
    `INSERT INTO erp_messages
      (company_id, author_empid, parent_message_id, body, topic, transaction_id, plan_id, transaction_table, transaction_row_id, transaction_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [scopedCompanyId, user.empid, parentMessageId, body, topic, transactionId, planId, transactionTable, transactionRowId, transactionLabel],
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
  const normalizedEmpid = normalizeEmpid(empid);
  if (!scopedCompanyId || !normalizedEmpid) return;
  if (!onlineByCompany.has(scopedCompanyId)) onlineByCompany.set(scopedCompanyId, new Set());
  onlineByCompany.get(scopedCompanyId).add(normalizedEmpid);
  if (ioRef) {
    ioRef.to(`company:${scopedCompanyId}`).emit('messages:presence', {
      companyId: scopedCompanyId,
      onlineUsers: listOnline(scopedCompanyId),
    });
  }
}

export function markOffline(companyId, empid) {
  const scopedCompanyId = toId(companyId);
  const normalizedEmpid = normalizeEmpid(empid);
  if (!scopedCompanyId || !normalizedEmpid) return;
  const set = onlineByCompany.get(scopedCompanyId);
  if (!set) return;
  set.delete(normalizedEmpid);
  if (set.size === 0) onlineByCompany.delete(scopedCompanyId);
  if (ioRef) {
    ioRef.to(`company:${scopedCompanyId}`).emit('messages:presence', {
      companyId: scopedCompanyId,
      onlineUsers: listOnline(scopedCompanyId),
    });
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test';
process.env.ERP_ADMIN_USER = process.env.ERP_ADMIN_USER || 'test';
process.env.ERP_ADMIN_PASS = process.env.ERP_ADMIN_PASS || 'test';

const {
  createConversationRoot,
  listConversations,
  postConversationMessage,
  getConversationMessages,
} = await import('./messagingService.js');

class MockDb {
  constructor() {
    this.nextConversationId = 1;
    this.nextMessageId = 1;
    this.conversations = [];
    this.participants = [];
    this.messages = [];
  }

  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();

    if (text.startsWith('SELECT * FROM erp_conversations WHERE company_id = ? AND type =')) {
      const [companyId] = params;
      const row = this.conversations.find((c) => c.company_id === Number(companyId) && c.type === 'general' && !c.deleted_at);
      return [[row].filter(Boolean), undefined];
    }
    if (text.startsWith('INSERT INTO erp_conversations (company_id, type, created_by_empid)')) {
      const [companyId, empid] = params;
      const row = { id: this.nextConversationId++, company_id: Number(companyId), type: 'general', linked_type: null, linked_id: null, created_by_empid: empid, deleted_at: null, last_message_id: null, last_message_at: null };
      this.conversations.push(row);
      return [{ insertId: row.id }, undefined];
    }
    if (text.startsWith('INSERT INTO erp_conversations (company_id, type, linked_type, linked_id, created_by_empid)')) {
      const [companyId, type, linkedType, linkedId, empid] = params;
      const row = { id: this.nextConversationId++, company_id: Number(companyId), type, linked_type: linkedType, linked_id: linkedId, created_by_empid: empid, deleted_at: null, last_message_id: null, last_message_at: null };
      this.conversations.push(row);
      return [{ insertId: row.id }, undefined];
    }
    if (text.startsWith('SELECT * FROM erp_conversations WHERE id = ? LIMIT 1')) {
      const [id] = params;
      return [[this.conversations.find((c) => c.id === Number(id))].filter(Boolean), undefined];
    }
    if (text.startsWith('SELECT * FROM erp_conversations WHERE id = ? AND company_id = ?')) {
      const [id, companyId] = params;
      return [[this.conversations.find((c) => c.id === Number(id) && c.company_id === Number(companyId) && !c.deleted_at)].filter(Boolean), undefined];
    }
    if (text.startsWith('INSERT INTO erp_conversation_participants')) {
      const [conversationId, companyId, empid] = params;
      const existing = this.participants.find((p) => p.conversation_id === Number(conversationId) && p.empid === empid);
      if (existing) existing.left_at = null;
      else this.participants.push({ conversation_id: Number(conversationId), company_id: Number(companyId), empid, left_at: null });
      return [{ affectedRows: 1 }, undefined];
    }
    if (text.startsWith('SELECT 1 FROM erp_conversation_participants')) {
      const [companyId, conversationId, empid] = params;
      const exists = this.participants.find((p) => p.company_id === Number(companyId) && p.conversation_id === Number(conversationId) && p.empid === empid && !p.left_at);
      return [[exists ? { 1: 1 } : null].filter(Boolean), undefined];
    }
    if (text.startsWith('INSERT INTO erp_messages')) {
      const [companyId, conversationId, authorEmpid, parentMessageId, body, topic, messageClass] = params;
      const row = { id: this.nextMessageId++, company_id: Number(companyId), conversation_id: Number(conversationId), author_empid: authorEmpid, parent_message_id: parentMessageId ? Number(parentMessageId) : null, body, topic, message_class: messageClass, created_at: new Date().toISOString(), deleted_at: null };
      this.messages.push(row);
      return [{ insertId: row.id }, undefined];
    }
    if (text.startsWith('SELECT * FROM erp_messages WHERE id = ? LIMIT 1')) {
      const [id] = params;
      return [[this.messages.find((m) => m.id === Number(id))].filter(Boolean), undefined];
    }
    if (text.startsWith('UPDATE erp_conversations SET last_message_id = ?')) {
      const [lastId, at, conversationId] = params;
      const row = this.conversations.find((c) => c.id === Number(conversationId));
      if (row) {
        row.last_message_id = Number(lastId);
        row.last_message_at = at || new Date().toISOString();
      }
      return [{ affectedRows: row ? 1 : 0 }, undefined];
    }
    if (text.startsWith('SELECT c.*, (c.type =')) {
      const [companyId, empid, maybeCursor, limit] = params;
      const hasCursor = params.length === 4;
      const cursorId = hasCursor ? Number(maybeCursor) : null;
      const max = Number(hasCursor ? limit : maybeCursor);
      const rows = this.conversations
        .filter((c) => c.company_id === Number(companyId) && !c.deleted_at)
        .filter((c) => c.type === 'general' || this.participants.some((p) => p.company_id === c.company_id && p.conversation_id === c.id && p.empid === empid && !p.left_at))
        .filter((c) => (hasCursor ? c.id < cursorId : true))
        .sort((a, b) => (b.type === 'general') - (a.type === 'general') || b.id - a.id)
        .slice(0, max)
        .map((c) => ({ ...c, is_general: c.type === 'general' }));
      return [rows, undefined];
    }
    if (text.startsWith('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL')) {
      const [id, companyId] = params;
      return [[this.messages.find((m) => m.id === Number(id) && m.company_id === Number(companyId) && !m.deleted_at)].filter(Boolean), undefined];
    }
    if (text.startsWith('SELECT * FROM erp_messages WHERE company_id = ? AND conversation_id = ?')) {
      const [companyId, conversationId] = params;
      const hasCursor = text.includes('AND id < ?');
      const cursor = hasCursor ? Number(params[2]) : null;
      const limit = Number(params[params.length - 1]);
      const rows = this.messages
        .filter((m) => m.company_id === Number(companyId) && m.conversation_id === Number(conversationId) && !m.deleted_at)
        .filter((m) => (hasCursor ? m.id < cursor : true))
        .sort((a, b) => b.id - a.id)
        .slice(0, limit);
      return [rows, undefined];
    }

    throw new Error(`Unhandled SQL: ${text}`);
  }
}

const session = { permissions: { messaging: true } };
const getSession = async () => session;

test('general conversation is auto-created and visible to all users in company', async () => {
  const db = new MockDb();
  const userA = { empid: 'A1', companyId: 7 };
  const userB = { empid: 'B1', companyId: 7 };

  await listConversations({ user: userA, companyId: 7, db, getSession });
  const listForB = await listConversations({ user: userB, companyId: 7, db, getSession });

  assert.equal(listForB.items.length, 1);
  assert.equal(listForB.items[0].type, 'general');
});

test('private conversation visibility is participant-only and topic stored separately', async () => {
  const db = new MockDb();
  const creator = { empid: 'E1', companyId: 1 };

  const created = await createConversationRoot({
    user: creator,
    companyId: 1,
    db,
    getSession,
    payload: {
      type: 'private',
      participants: ['E2'],
      topic: 'Finance',
      body: 'First message',
      messageClass: 'financial',
    },
  });

  assert.equal(created.message.topic, 'Finance');
  assert.equal(created.message.body, 'First message');

  const visibleToE2 = await listConversations({ user: { empid: 'E2', companyId: 1 }, companyId: 1, db, getSession });
  const visibleToE3 = await listConversations({ user: { empid: 'E3', companyId: 1 }, companyId: 1, db, getSession });
  assert.equal(visibleToE2.items.some((entry) => entry.id === created.conversation.id), true);
  assert.equal(visibleToE3.items.some((entry) => entry.id === created.conversation.id), false);
});

test('sending message requires participant access and validates message_class enum', async () => {
  const db = new MockDb();
  const creator = { empid: 'E1', companyId: 1 };
  const created = await createConversationRoot({ user: creator, companyId: 1, db, getSession, payload: { type: 'private', participants: ['E2'], body: 'First message' } });

  await assert.rejects(
    () => postConversationMessage({ user: { empid: 'E3', companyId: 1 }, companyId: 1, conversationId: created.conversation.id, db, getSession, payload: { body: 'No access' } }),
    /Conversation not found/,
  );

  await assert.rejects(
    () => postConversationMessage({ user: { empid: 'E2', companyId: 1 }, companyId: 1, conversationId: created.conversation.id, db, getSession, payload: { body: 'Bad class', messageClass: 'private' } }),
    /messageClass must be one of/,
  );

  const sent = await postConversationMessage({ user: { empid: 'E2', companyId: 1 }, companyId: 1, conversationId: created.conversation.id, db, getSession, payload: { body: 'Allowed', messageClass: 'general' } });
  const thread = await getConversationMessages({ user: creator, companyId: 1, conversationId: created.conversation.id, db, getSession });
  assert.equal(sent.message.body, 'Allowed');
  assert.equal(thread.items.length, 2);
});

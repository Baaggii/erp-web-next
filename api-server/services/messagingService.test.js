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
  deleteConversation,
  patchConversationTopic,
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
    if (text.startsWith('INSERT INTO erp_conversations (company_id, type, topic, linked_type, linked_id, created_by_empid)')) {
      const [companyId, type, topic, linkedType, linkedId, empid] = params;
      const row = { id: this.nextConversationId++, company_id: Number(companyId), type, topic, linked_type: linkedType, linked_id: linkedId, created_by_empid: empid, deleted_at: null, last_message_id: null, last_message_at: null };
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
      const [companyId, conversationId, authorEmpid, parentMessageId, body, messageClass] = params;
      const row = { id: this.nextMessageId++, company_id: Number(companyId), conversation_id: Number(conversationId), author_empid: authorEmpid, parent_message_id: parentMessageId ? Number(parentMessageId) : null, body, message_class: messageClass, created_at: new Date().toISOString(), deleted_at: null };
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
    if (text.startsWith('UPDATE erp_conversations SET topic = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL')) {
      const [topic, conversationId, companyId] = params;
      const row = this.conversations.find((c) => c.id === Number(conversationId) && c.company_id === Number(companyId) && !c.deleted_at);
      if (row) row.topic = topic;
      return [{ affectedRows: row ? 1 : 0 }, undefined];
    }
    if (text.startsWith('SELECT c.*,')) {
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

    if (text.startsWith('UPDATE erp_conversations SET deleted_at = CURRENT_TIMESTAMP')) {
      const [conversationId, companyId] = params;
      const row = this.conversations.find((c) => c.id === Number(conversationId) && c.company_id === Number(companyId) && !c.deleted_at);
      if (row) row.deleted_at = new Date().toISOString();
      return [{ affectedRows: row ? 1 : 0 }, undefined];
    }
    if (text.startsWith('UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP WHERE conversation_id = ?')) {
      const [conversationId, companyId] = params;
      this.messages.forEach((m) => {
        if (m.conversation_id === Number(conversationId) && m.company_id === Number(companyId) && !m.deleted_at) m.deleted_at = new Date().toISOString();
      });
      return [{ affectedRows: 1 }, undefined];
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
        .filter((m) => m.company_id === Number(companyId) && m.conversation_id === Number(conversationId))
        .filter((m) => (hasCursor ? m.id < cursor : true))
        .sort((a, b) => b.id - a.id)
        .slice(0, limit);
      return [rows, undefined];
    }

    if (text.startsWith('INSERT IGNORE INTO erp_message_reads')) {
      return [{ affectedRows: 0 }, undefined];
    }
    if (text.startsWith('SELECT message_id, empid FROM erp_message_reads')) {
      return [[], undefined];
    }
    if (text.startsWith('SELECT message_id, emoji, empid FROM erp_message_reactions')) {
      return [[], undefined];
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

test('private conversation stores topic on conversation only and preserves message body', async () => {
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

  assert.equal(created.conversation.topic, 'Finance');
  assert.equal(created.message.topic, undefined);
  assert.equal(created.message.body, 'First message');

  const visibleToE2 = await listConversations({ user: { empid: 'E2', companyId: 1 }, companyId: 1, db, getSession });
  const visibleToE3 = await listConversations({ user: { empid: 'E3', companyId: 1 }, companyId: 1, db, getSession });
  assert.equal(visibleToE2.items.some((entry) => entry.id === created.conversation.id), true);
  assert.equal(visibleToE3.items.some((entry) => entry.id === created.conversation.id), false);
});

test('sending message requires participant access and validates message_class enum', async () => {
  const db = new MockDb();
  const creator = { empid: 'E1', companyId: 1 };
  const created = await createConversationRoot({ user: creator, companyId: 1, db, getSession, payload: { type: 'private', participants: ['E2'], topic: 'Start', body: 'First message' } });

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




test('getConversationMessages keeps deleted messages with masked body', async () => {
  const db = new MockDb();
  const creator = { empid: 'E1', companyId: 4 };
  const created = await createConversationRoot({
    user: creator,
    companyId: 4,
    db,
    getSession,
    payload: { type: 'private', participants: ['E2'], topic: 'Mask deleted', body: 'Visible before delete' },
  });

  db.messages[0].deleted_at = new Date().toISOString();

  const thread = await getConversationMessages({ user: creator, companyId: 4, conversationId: created.conversation.id, db, getSession });
  assert.equal(thread.items.length, 1);
  assert.equal(Boolean(thread.items[0].deleted_at), true);
  assert.equal(thread.items[0].body, '');
});

test('conversation creator can delete conversation and others cannot', async () => {
  const db = new MockDb();
  const creator = { empid: 'E1', companyId: 2 };
  const created = await createConversationRoot({ user: creator, companyId: 2, db, getSession, payload: { type: 'private', participants: ['E2'], topic: 'Root topic', body: 'Root message' } });

  await assert.rejects(
    () => deleteConversation({ user: { empid: 'E2', companyId: 2 }, companyId: 2, conversationId: created.conversation.id, db, getSession }),
    /Only the conversation creator can delete this conversation/,
  );

  const deleted = await deleteConversation({ user: creator, companyId: 2, conversationId: created.conversation.id, db, getSession });
  assert.equal(deleted.ok, true);

  const list = await listConversations({ user: creator, companyId: 2, db, getSession });
  assert.equal(list.items.some((entry) => Number(entry.id) === Number(created.conversation.id)), false);
});


test('conversation creator/admin can update topic, non-creator cannot', async () => {
  const db = new MockDb();
  const creator = { empid: 'E1', companyId: 3 };
  const created = await createConversationRoot({
    user: creator,
    companyId: 3,
    db,
    getSession,
    payload: { type: 'private', participants: ['E2'], topic: 'Original', body: 'Root message' },
  });

  await assert.rejects(
    () => patchConversationTopic({
      user: { empid: 'E2', companyId: 3 },
      companyId: 3,
      conversationId: created.conversation.id,
      payload: { topic: 'No access' },
      db,
      getSession,
    }),
    /Only creator may edit topic/,
  );

  const updated = await patchConversationTopic({
    user: creator,
    companyId: 3,
    conversationId: created.conversation.id,
    payload: { topic: 'Updated by creator' },
    db,
    getSession,
  });
  assert.equal(updated.conversation.topic, 'Updated by creator');

  const adminUpdated = await patchConversationTopic({
    user: { empid: 'E9', companyId: 3, isAdmin: true },
    companyId: 3,
    conversationId: created.conversation.id,
    payload: { topic: 'Updated by admin' },
    db,
    getSession,
  });
  assert.equal(adminUpdated.conversation.topic, 'Updated by admin');
});


test('patchConversationTopic emits conversation.updated socket event', async () => {
  const db = new MockDb();
  const creator = { empid: 'E1', companyId: 4 };
  const created = await createConversationRoot({
    user: creator,
    companyId: 4,
    db,
    getSession,
    payload: { type: 'private', participants: ['E2'], topic: 'Initial', body: 'Root' },
  });

  const emitted = [];
  const io = {
    to(initialRoom) {
      const rooms = [initialRoom];
      return {
        to(nextRoom) {
          rooms.push(nextRoom);
          return this;
        },
        emit(event, payload) {
          emitted.push({ rooms: [...rooms], event, payload });
        },
      };
    },
  };
  const { setMessagingIo } = await import('./messagingService.js');
  setMessagingIo(io);

  await patchConversationTopic({
    user: creator,
    companyId: 4,
    conversationId: created.conversation.id,
    payload: { topic: 'Socket topic' },
    db,
    getSession,
  });

  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].rooms.sort(), ['company:4', 'messaging:4']);
  assert.equal(emitted[0].event, 'conversation.updated');
  assert.equal(emitted[0].payload.topic, 'Socket topic');
  setMessagingIo(null);
});

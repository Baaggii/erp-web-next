import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test';
process.env.ERP_ADMIN_USER = process.env.ERP_ADMIN_USER || 'test';
process.env.ERP_ADMIN_PASS = process.env.ERP_ADMIN_PASS || 'test';

const {
  addMessageReaction,
  removeMessageReaction,
  toggleMessageReaction,
  getConversationMessages,
  setMessagingIo,
} = await import('./messagingService.js');

class ReactionDb {
  constructor() {
    this.conversations = [{ id: 1, company_id: 9, type: 'private', deleted_at: null }];
    this.participants = [
      { company_id: 9, conversation_id: 1, empid: 'E1', left_at: null },
      { company_id: 9, conversation_id: 1, empid: 'E2', left_at: null },
      { company_id: 9, conversation_id: 1, empid: 'E3', left_at: null },
    ];
    this.messages = [{ id: 10, company_id: 9, conversation_id: 1, author_empid: 'E2', deleted_at: null }];
    this.reactions = [];
    this.notifications = [];
  }

  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();

    if (text.startsWith('SELECT * FROM erp_messages WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1')) {
      const [id, companyId] = params;
      return [[this.messages.find((m) => m.id === Number(id) && m.company_id === Number(companyId) && !m.deleted_at)].filter(Boolean), undefined];
    }
    if (text.startsWith('SELECT * FROM erp_conversations WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1')) {
      const [id, companyId] = params;
      return [[this.conversations.find((c) => c.id === Number(id) && c.company_id === Number(companyId) && !c.deleted_at)].filter(Boolean), undefined];
    }
    if (text.startsWith('SELECT 1 FROM erp_conversation_participants')) {
      const [companyId, conversationId, empid] = params;
      const row = this.participants.find((p) => p.company_id === Number(companyId) && p.conversation_id === Number(conversationId) && p.empid === empid && !p.left_at);
      return [[row ? { 1: 1 } : null].filter(Boolean), undefined];
    }
    if (text.startsWith('INSERT INTO erp_message_reactions')) {
      const [messageId, companyId, empid, emoji] = params;
      const existing = this.reactions.find((r) => r.message_id === Number(messageId) && r.company_id === Number(companyId) && r.empid === empid && r.emoji === emoji);
      if (existing) {
        existing.deleted_at = null;
      } else {
        this.reactions.push({ message_id: Number(messageId), company_id: Number(companyId), empid, emoji, deleted_at: null });
      }
      return [{ affectedRows: 1 }, undefined];
    }
    if (text.startsWith('UPDATE erp_message_reactions SET deleted_at = CURRENT_TIMESTAMP')) {
      const [messageId, companyId, empid, emoji] = params;
      const existing = this.reactions.find((r) => r.message_id === Number(messageId) && r.company_id === Number(companyId) && r.empid === empid && r.emoji === emoji && !r.deleted_at);
      if (existing) existing.deleted_at = new Date().toISOString();
      return [{ affectedRows: existing ? 1 : 0 }, undefined];
    }
    if (text.startsWith('SELECT deleted_at FROM erp_message_reactions')) {
      const [messageId, companyId, empid, emoji] = params;
      const existing = this.reactions.find((r) => r.message_id === Number(messageId) && r.company_id === Number(companyId) && r.empid === empid && r.emoji === emoji);
      return [[existing ? { deleted_at: existing.deleted_at } : null].filter(Boolean), undefined];
    }
    if (text.startsWith('SELECT * FROM erp_messages WHERE company_id = ?')) {
      const [companyId, conversationId] = params;
      const rows = this.messages.filter((m) => m.company_id === Number(companyId) && m.conversation_id === Number(conversationId) && !m.deleted_at);
      return [rows, undefined];
    }
    if (text.startsWith('INSERT IGNORE INTO erp_message_reads')) return [{ affectedRows: 0 }, undefined];
    if (text.startsWith('SELECT message_id, empid FROM erp_message_reads')) return [[], undefined];
    if (text.startsWith('SELECT message_id, emoji, empid FROM erp_message_reactions')) {
      const [companyId] = params;
      const ids = params.slice(1).map(Number);
      const rows = this.reactions
        .filter((r) => r.company_id === Number(companyId) && ids.includes(r.message_id) && !r.deleted_at)
        .map((r) => ({ message_id: r.message_id, emoji: r.emoji, empid: r.empid }));
      return [rows, undefined];
    }
    if (text.startsWith('INSERT INTO notifications')) {
      const [companyId, recipientEmpid, relatedId, message, createdBy] = params;
      const row = {
        notification_id: this.notifications.length + 1,
        company_id: Number(companyId),
        recipient_empid: recipientEmpid,
        type: 'request',
        related_id: Number(relatedId),
        message,
        created_by: createdBy,
      };
      this.notifications.push(row);
      return [{ insertId: row.notification_id, affectedRows: 1 }, undefined];
    }

    throw new Error(`Unhandled SQL in test mock: ${text}`);
  }
}

const getSession = async () => ({ permissions: { messaging: true } });

test('message reactions can be added/toggled/removed and returned with message payload', async () => {
  const db = new ReactionDb();
  const user = { empid: 'E1', companyId: 9 };

  await addMessageReaction({ user, companyId: 9, messageId: 10, payload: { emoji: '🧪' }, db, getSession });
  await toggleMessageReaction({ user, companyId: 9, messageId: 10, payload: { emoji: '🔥' }, db, getSession });
  await toggleMessageReaction({ user, companyId: 9, messageId: 10, payload: { emoji: '🔥' }, db, getSession });
  await removeMessageReaction({ user, companyId: 9, messageId: 10, payload: { emoji: '🧪' }, db, getSession });
  await addMessageReaction({ user, companyId: 9, messageId: 10, payload: { emoji: '🎉' }, db, getSession });

  const response = await getConversationMessages({ user, companyId: 9, conversationId: 1, db, getSession });
  assert.equal(response.items.length, 1);
  assert.deepEqual(response.items[0].reactions, [{ emoji: '🎉', count: 1, users: ['E1'] }]);
});

test('add/remove reaction notifies message owner and skips self reaction notifications', async () => {
  const db = new ReactionDb();
  const events = [];
  setMessagingIo({
    to(room) {
      return {
        emit(event, payload) {
          events.push({ room, event, payload });
        },
      };
    },
  });

  await addMessageReaction({
    user: { empid: 'E3', companyId: 9 },
    companyId: 9,
    messageId: 10,
    payload: { emoji: '🧪' },
    db,
    getSession,
  });
  await removeMessageReaction({
    user: { empid: 'E3', companyId: 9 },
    companyId: 9,
    messageId: 10,
    payload: { emoji: '🧪' },
    db,
    getSession,
  });

  db.messages.push({ id: 11, company_id: 9, conversation_id: 1, author_empid: 'E3', deleted_at: null });
  await addMessageReaction({
    user: { empid: 'E3', companyId: 9 },
    companyId: 9,
    messageId: 11,
    payload: { emoji: '🔥' },
    db,
    getSession,
  });

  assert.equal(db.notifications.length, 2);
  assert.equal(db.notifications[0].recipient_empid, 'E2');
  assert.equal(db.notifications[1].recipient_empid, 'E2');
  assert.match(db.notifications[0].message, /E3 reacted 🧪 to your message/);
  assert.match(db.notifications[1].message, /E3 removed 🧪 reaction from your message/);
  assert.equal(events.length, 4);
  assert.deepEqual(events.map((entry) => entry.room), ['user:E2', 'user:E2', 'user:E2', 'user:E2']);
  assert.deepEqual(events.map((entry) => entry.event), [
    'notification:new',
    'message.reaction.activity',
    'notification:new',
    'message.reaction.activity',
  ]);
  assert.equal(events[1].payload?.eventType, 'reaction_added');
  assert.equal(events[3].payload?.eventType, 'reaction_removed');

  setMessagingIo(null);
});

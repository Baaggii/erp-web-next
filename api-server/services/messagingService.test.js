import test from 'node:test';
import assert from 'node:assert/strict';


process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test';
process.env.ERP_ADMIN_USER = process.env.ERP_ADMIN_USER || 'test';
process.env.ERP_ADMIN_PASS = process.env.ERP_ADMIN_PASS || 'test';

const {
  createConversationRoot,
  deleteMessage,
  getConversationMessages,
  getThread,
  listConversations,
  postConversationMessage,
  postMessage,
  postReply,
} = await import('./messagingService.js');


class MockDb {
  constructor() {
    this.nextId = 100;
    this.idempotency = new Map();
    this.messages = [
      {
        id: 11,
        company_id: 1,
        author_empid: 'E100',
        parent_message_id: null,
        conversation_id: 11,
        linked_type: null,
        linked_id: null,
        visibility_scope: 'private',
        visibility_department_id: null,
        visibility_empid: 'E100,E200',
        body: 'Root',
        deleted_at: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 12,
        company_id: 1,
        author_empid: 'E200',
        parent_message_id: 11,
        conversation_id: 11,
        linked_type: null,
        linked_id: null,
        visibility_scope: 'private',
        visibility_department_id: null,
        visibility_empid: 'E100,E200',
        body: 'Reply',
        deleted_at: null,
        created_at: new Date().toISOString(),
      },
    ];
  }

  async query(sql, params = []) {
    const text = String(sql);

    if (text.includes('information_schema.TABLES') && text.includes("TABLE_NAME = 'erp_messages'")) return [[{ count: 1 }], undefined];
    if (text.startsWith('CALL create_tenant_temp_table')) return [[], undefined];

    if (text.includes('FROM') && text.includes('erp_message_idempotency') && text.includes('SELECT')) {
      const key = `${params[0]}:${params[1]}`;
      const row = this.idempotency.get(key) || null;
      return [[row].filter(Boolean), undefined];
    }

    if (text.includes('INSERT INTO erp_message_idempotency')) {
      const key = `${params[1]}:${params[2]}`;
      this.idempotency.set(key, { message_id: params[3], request_hash: params[4] ?? null, expires_at: params[5] ?? null });
      return [{ affectedRows: 1 }, undefined];
    }

    if (text.includes('SELECT * FROM') && text.includes('erp_messages') && text.includes('WHERE id = ? LIMIT 1')) {
      const id = Number(params[0]);
      const row = this.messages.find((entry) => Number(entry.id) === id) || null;
      return [[row].filter(Boolean), undefined];
    }


    if (text.includes('SELECT * FROM') && text.includes('conversation_id = ?') && text.includes('ORDER BY id DESC LIMIT ?')) {
      const conversationId = Number(params[0]);
      const limit = Number(params[params.length - 1]) || 100;
      const rows = this.messages
        .filter((entry) => Number(entry.conversation_id) === conversationId && entry.deleted_at == null)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit);
      return [rows, undefined];
    }
    if (text.includes('SELECT * FROM') && text.includes('parent_message_id IS NULL') && text.includes('ORDER BY id DESC LIMIT ?')) {
      const limit = Number(params[0]) || 100;
      const rows = this.messages
        .filter((entry) => entry.parent_message_id == null)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit);
      return [rows, undefined];
    }


    if (text.includes('JOIN (') && text.includes('MAX(id) AS last_message_id') && text.includes('GROUP BY conversation_id')) {
      const limit = Number(params[params.length - 1]) || 100;
      const grouped = new Map();
      this.messages.filter((entry) => entry.deleted_at == null).forEach((entry) => {
        const key = Number(entry.conversation_id);
        const existing = grouped.get(key);
        if (!existing || Number(entry.id) > Number(existing.id)) grouped.set(key, entry);
      });
      const rows = Array.from(grouped.values())
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime() || b.id - a.id)
        .slice(0, limit);
      return [rows, undefined];
    }
    if (text.includes('SELECT * FROM') && text.includes('erp_messages') && text.includes('ORDER BY id ASC')) {
      return [[...this.messages].sort((a, b) => a.id - b.id), undefined];
    }

    if (text.includes('SELECT id, parent_message_id FROM') && text.includes('erp_messages')) {
      return [[this.messages.map(({ id, parent_message_id }) => ({ id, parent_message_id }))], undefined];
    }

    if (text.includes('INSERT INTO erp_messages')) {
      const [companyId, empid, parentMessageId, conversationId] = params;
      const parent = parentMessageId ? this.messages.find((entry) => Number(entry.id) === Number(parentMessageId)) : null;
      const id = this.nextId++;
      this.messages.push({
        id,
        company_id: Number(companyId),
        author_empid: empid,
        parent_message_id: parentMessageId == null ? null : Number(parentMessageId),
        conversation_id: conversationId ? Number(conversationId) : parent ? Number(parent.conversation_id || parent.id) : null,
        linked_type: null,
        linked_id: null,
        visibility_scope: 'private',
        visibility_department_id: null,
        visibility_empid: 'E100,E200',
        body: 'inserted',
        deleted_at: null,
        created_at: new Date().toISOString(),
      });
      return [{ insertId: id }, undefined];
    }

    if (text.startsWith('UPDATE erp_messages SET conversation_id = ?')) {
      const [conversationId, messageId] = params;
      const row = this.messages.find((entry) => Number(entry.id) === Number(messageId));
      if (row) row.conversation_id = Number(conversationId);
      return [{ affectedRows: row ? 1 : 0 }, undefined];
    }

    if (text.startsWith('UPDATE erp_messages SET visibility_empid = ?')) {
      const [visibilityEmpid, messageId] = params;
      const row = this.messages.find((entry) => Number(entry.id) === Number(messageId));
      if (row) row.visibility_empid = visibilityEmpid;
      return [{ affectedRows: row ? 1 : 0 }, undefined];
    }

    if (text.startsWith('UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by_empid = ? WHERE company_id = ? AND conversation_id = ?')) {
      const [, companyId, conversationId] = params;
      let count = 0;
      this.messages.forEach((row) => {
        if (Number(row.company_id) === Number(companyId) && Number(row.conversation_id) === Number(conversationId)) {
          row.deleted_at = new Date().toISOString();
          count += 1;
        }
      });
      return [{ affectedRows: count }, undefined];
    }

    if (text.startsWith('UPDATE erp_messages SET deleted_at = CURRENT_TIMESTAMP')) {
      const [, messageId, companyId] = params;
      const row = this.messages.find((entry) => Number(entry.id) === Number(messageId) && Number(entry.company_id) === Number(companyId));
      if (row) row.deleted_at = new Date().toISOString();
      return [{ affectedRows: row ? 1 : 0 }, undefined];
    }

    if (text.includes('INSERT IGNORE INTO erp_message_receipts')) {
      return [{ affectedRows: 1 }, undefined];
    }

    if (text.includes('INSERT INTO security_audit_events')) {
      return [{ affectedRows: 1 }, undefined];
    }

    throw new Error(`Unexpected query: ${text}`);
  }
}

const getSession = async () => ({ department_id: 10, permissions: { system_settings: true } });
const baseUser = { empid: 'E100', companyId: 1 };

test('root message creation sets canonical conversation_id', async () => {
  const db = new MockDb();
  const result = await postMessage({
    user: baseUser,
    companyId: 1,
    payload: { idempotencyKey: 'root-1', body: 'Root body', recipientEmpids: ['E200'] },
    correlationId: 'corr-root',
    db,
    getSession,
  });

  assert.equal(Number(result.message.id), Number(result.message.conversation_id));
  assert.equal(result.message.parent_message_id, null);
});

test('reply creation enforces conversation_id consistency', async () => {
  const db = new MockDb();
  await assert.rejects(
    () => postReply({
      user: baseUser,
      companyId: 1,
      messageId: 11,
      payload: { idempotencyKey: 'reply-bad', body: 'Bad reply', conversation_id: 999 },
      correlationId: 'corr-reply-bad',
      db,
      getSession,
    }),
    (error) => error?.code === 'CONVERSATION_MISMATCH',
  );

  const ok = await postReply({
    user: baseUser,
    companyId: 1,
    messageId: 11,
    payload: { idempotencyKey: 'reply-ok', body: 'OK reply', conversation_id: 11 },
    correlationId: 'corr-reply-ok',
    db,
    getSession,
  });
  assert.equal(Number(ok.message.conversation_id), 11);
  assert.equal(Number(ok.message.parent_message_id), 11);
});

test('duplicate send idempotency replays existing message without creating another conversation', async () => {
  const db = new MockDb();
  const payload = { idempotencyKey: 'idem-dup', body: 'same body', recipientEmpids: ['E200'] };
  const first = await postMessage({ user: baseUser, companyId: 1, payload, correlationId: 'corr-idem-1', db, getSession });
  const second = await postMessage({ user: baseUser, companyId: 1, payload, correlationId: 'corr-idem-2', db, getSession });

  assert.equal(first.message.id, second.message.id);
  assert.equal(Number(first.message.conversation_id), Number(second.message.conversation_id));
});

test('deleting root message deletes only that conversation scope', async () => {
  const db = new MockDb();
  db.messages.push({
    id: 50,
    company_id: 1,
    author_empid: 'E300',
    parent_message_id: null,
    conversation_id: 50,
    linked_type: null,
    linked_id: null,
    visibility_scope: 'private',
    visibility_department_id: null,
    visibility_empid: 'E100,E300',
    body: 'Other conversation root',
    deleted_at: null,
    created_at: new Date().toISOString(),
  });

  await deleteMessage({ user: baseUser, companyId: 1, messageId: 11, correlationId: 'corr-del', db, getSession });

  assert.ok(db.messages.find((m) => m.id === 11)?.deleted_at);
  assert.ok(db.messages.find((m) => m.id === 12)?.deleted_at);
  assert.equal(db.messages.find((m) => m.id === 50)?.deleted_at, null);
});

test('thread loading resolves root by conversation_id and includes descendants', async () => {
  const db = new MockDb();
  const thread = await getThread({ user: baseUser, companyId: 1, messageId: 12, correlationId: 'corr-thread', db, getSession });
  assert.equal(Number(thread.root.id), 11);
  assert.ok(thread.replies.some((reply) => Number(reply.id) === 12));
});


test('postMessage requires conversationId when parentMessageId is provided', async () => {
  const db = new MockDb();
  await assert.rejects(
    () => postMessage({
      user: baseUser,
      companyId: 1,
      payload: { idempotencyKey: 'missing-conv', body: 'Reply body', parentMessageId: 11 },
      correlationId: 'corr-missing-conv',
      db,
      getSession,
    }),
    (error) => error?.code === 'CONVERSATION_REQUIRED',
  );
});

test('conversation-centric service helpers preserve canonical thread identity', async () => {
  const db = new MockDb();
  const root = await createConversationRoot({
    user: baseUser,
    companyId: 1,
    payload: { idempotencyKey: 'conv-root', body: 'Conversation root', recipientEmpids: ['E200'] },
    correlationId: 'corr-conv-root',
    db,
    getSession,
  });

  const conversationId = Number(root.message.conversation_id);
  const nested = await postConversationMessage({
    user: baseUser,
    companyId: 1,
    conversationId,
    payload: { idempotencyKey: 'conv-reply', body: 'Nested', parentMessageId: root.message.id },
    correlationId: 'corr-conv-reply',
    db,
    getSession,
  });

  assert.equal(Number(nested.message.conversation_id), conversationId);
  const list = await listConversations({ user: baseUser, companyId: 1, correlationId: 'corr-list', db, getSession });
  assert.ok(list.items.some((item) => Number(item.conversation_id) === conversationId));

  const thread = await getConversationMessages({
    user: baseUser,
    companyId: 1,
    conversationId,
    correlationId: 'corr-conversation-messages',
    db,
    getSession,
  });
  assert.ok(Array.isArray(thread.items));
  assert.ok(thread.items.some((item) => Number(item.id) === Number(nested.message.id)));
});

test('postConversationMessage rejects non-root conversationId values', async () => {
  const db = new MockDb();
  await assert.rejects(
    () => postConversationMessage({
      user: baseUser,
      companyId: 1,
      conversationId: 12,
      payload: { idempotencyKey: 'non-root-conv-id', body: 'Should fail' },
      correlationId: 'corr-non-root-conv-id',
      db,
      getSession,
    }),
    (error) => error?.code === 'CONVERSATION_ROOT_REQUIRED',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteMessage, getMessages, patchMessage, postMessage, postReply, setMessagingIo } from '../../api-server/services/messagingService.js';
import { resetMessagingMetrics } from '../../api-server/services/messagingMetrics.js';

class FakeDb {
  constructor({ supportsEncryptedBodyColumns = true, deleteByColumn = 'deleted_by_empid' } = {}) {
    this.messages = [];
    this.idem = new Map();
    this.nextId = 1;
    this.securityAuditEvents = [];
    this.supportsEncryptedBodyColumns = supportsEncryptedBodyColumns;
    this.deleteByColumn = deleteByColumn;
  }

  async query(sql, params = []) {

    if (!this.supportsEncryptedBodyColumns && sql.includes('body_ciphertext')) {
      const error = new Error("Unknown column 'body_ciphertext' in 'field list'");
      error.sqlMessage = "Unknown column 'body_ciphertext' in 'field list'";
      throw error;
    }
    if (sql.includes('deleted_by_empid') && this.deleteByColumn !== 'deleted_by_empid') {
      const error = new Error("Unknown column 'deleted_by_empid' in 'field list'");
      error.sqlMessage = "Unknown column 'deleted_by_empid' in 'field list'";
      throw error;
    }
    if (sql.includes('deleted_by = ?') && this.deleteByColumn === 'none') {
      const error = new Error("Unknown column 'deleted_by' in 'field list'");
      error.sqlMessage = "Unknown column 'deleted_by' in 'field list'";
      throw error;
    }
    if (sql.includes('CREATE TABLE IF NOT EXISTS')) return [[]];
    if (sql.includes("FROM information_schema.TABLES") && sql.includes("TABLE_NAME = 'erp_messages'")) {
      return [[{ count: 1 }]];
    }
    if (sql.includes('FROM erp_message_idempotency')) {
      const [companyId, empid, key] = params;
      const messageId = this.idem.get(`${companyId}:${empid}:${key}`);
      return [messageId ? [{ message_id: messageId, request_hash: null, expires_at: null }] : []];
    }
    if (sql.startsWith('INSERT INTO erp_messages')) {
      const hasLinkedFields = sql.includes('linked_type') && sql.includes('linked_id');
      const [companyId, authorEmpid, parentId] = params;
      const baseOffset = hasLinkedFields ? 8 : 3;
      const message = {
        id: this.nextId++,
        company_id: companyId,
        author_empid: authorEmpid,
        parent_message_id: parentId,
        linked_type: hasLinkedFields ? params[3] : null,
        linked_id: hasLinkedFields ? params[4] : null,
        visibility_scope: hasLinkedFields ? params[5] : 'company',
        visibility_department_id: hasLinkedFields ? params[6] : null,
        visibility_empid: hasLinkedFields ? params[7] : null,
        body: params[baseOffset],
        body_ciphertext: params[baseOffset + 1],
        body_iv: params[baseOffset + 2],
        body_auth_tag: params[baseOffset + 3],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      this.messages.push(message);
      return [{ insertId: message.id }];
    }
    if (sql.startsWith('INSERT INTO erp_message_idempotency')) {
      const [companyId, empid, key, messageId] = params;
      this.idem.set(`${companyId}:${empid}:${key}`, messageId);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT * FROM erp_messages WHERE id = ? AND company_id = ?')) {
      const [id, companyId] = params;
      return [this.messages.filter((entry) => entry.id === id && entry.company_id === companyId)];
    }
    if (sql.startsWith('SELECT * FROM erp_messages WHERE company_id = ?')) {
      const companyId = params[0];
      const limit = params[params.length - 1];
      return [this.messages.filter((entry) => entry.company_id === companyId && !entry.deleted_at).slice(0, limit)];
    }
    if (sql.startsWith('UPDATE erp_messages SET body = ?, body_ciphertext = ?, body_iv = ?, body_auth_tag = ?')) {
      const [body, bodyCiphertext, bodyIv, bodyAuthTag, id, companyId] = params;
      const match = this.messages.find((entry) => entry.id === id && entry.company_id === companyId);
      if (match) {
        match.body = body;
        match.body_ciphertext = bodyCiphertext;
        match.body_iv = bodyIv;
        match.body_auth_tag = bodyAuthTag;
      }
      return [{ affectedRows: match ? 1 : 0 }];
    }
    if (sql.startsWith('UPDATE erp_messages SET deleted_at')) {
      const hasDeletedBy = sql.includes('deleted_by_empid') || sql.includes('deleted_by = ?');
      const [first, second, third] = params;
      const empid = hasDeletedBy ? first : null;
      const id = hasDeletedBy ? second : first;
      const companyId = hasDeletedBy ? third : second;
      const match = this.messages.find((entry) => entry.id === id && entry.company_id === companyId);
      if (match) {
        match.deleted_at = new Date().toISOString();
        if (sql.includes('deleted_by_empid')) match.deleted_by_empid = empid;
        if (sql.includes('deleted_by = ?')) match.deleted_by = empid;
      }
      return [{ affectedRows: match ? 1 : 0 }];
    }
    if (sql.startsWith('INSERT INTO security_audit_events')) {
      const [event, userId, companyId, details] = params;
      this.securityAuditEvents.push({ event, user_id: userId, company_id: companyId, details });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO erp_messaging_abuse_audit')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT IGNORE INTO erp_message_receipts')) return [{ affectedRows: 1 }];
    if (sql.startsWith('WITH RECURSIVE thread_cte')) return [this.messages.filter((entry) => !entry.deleted_at)];
    return [[]];
  }
}

const user = { empid: 'e-1', companyId: 1 };

test('auth + tenant isolation blocks cross-company delete (IDOR/BOLA)', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true } };

  const created = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'hello', linkedType: 'transaction', linkedId: 'tx-1', idempotencyKey: 'k1' },
    correlationId: 'c1',
    db,
    getSession: async () => session,
  });

  await assert.rejects(
    () =>
      deleteMessage({
        user,
        companyId: 2,
        messageId: created.message.id,
        correlationId: 'c2',
        db,
        getSession: async () => session,
      }),
    /Message not found/,
  );
});

test('tenant isolation: user from company B cannot view company A messages', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true } };

  await postMessage({
    user,
    companyId: 1,
    payload: { body: 'company A only', linkedType: 'transaction', linkedId: 'tx-a', idempotencyKey: 'tenant-a1' },
    correlationId: 'tenant-a1',
    db,
    getSession: async () => session,
  });

  const visibleInCompanyB = await getMessages({
    user: { empid: 'e-2', companyId: 2 },
    companyId: 2,
    correlationId: 'tenant-b1',
    db,
    getSession: async () => session,
  });

  assert.equal(visibleInCompanyB.items.length, 0);
});

test('tenant isolation: user from company B cannot edit company A message', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true } };

  const created = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'edit me', linkedType: 'transaction', linkedId: 'tx-a2', idempotencyKey: 'tenant-a2' },
    correlationId: 'tenant-a2',
    db,
    getSession: async () => session,
  });

  await assert.rejects(
    () =>
      patchMessage({
        user: { empid: 'e-2', companyId: 2 },
        companyId: 2,
        messageId: created.message.id,
        payload: { body: 'cross-tenant edit attempt' },
        correlationId: 'tenant-b2',
        db,
        getSession: async () => session,
      }),
    /Message not found/,
  );
});





test('postMessage falls back when encrypted body columns are unavailable', async () => {
  const db = new FakeDb({ supportsEncryptedBodyColumns: false });
  const session = { permissions: { messaging: true } };

  const created = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'legacy schema message', linkedType: 'topic', linkedId: 'legacy', idempotencyKey: 'legacy-new-1' },
    correlationId: 'legacy-new-1',
    db,
    getSession: async () => session,
  });

  assert.equal(created.message.body, 'legacy schema message');
});

test('postReply falls back when encrypted body columns are unavailable', async () => {
  const db = new FakeDb({ supportsEncryptedBodyColumns: false });
  const session = { permissions: { messaging: true } };

  const parent = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'parent legacy', linkedType: 'topic', linkedId: 'legacy', idempotencyKey: 'legacy-parent-1' },
    correlationId: 'legacy-parent-1',
    db,
    getSession: async () => session,
  });

  const reply = await postReply({
    user,
    companyId: 1,
    messageId: parent.message.id,
    payload: { body: 'legacy reply', idempotencyKey: 'legacy-reply-1' },
    correlationId: 'legacy-reply-1',
    db,
    getSession: async () => session,
  });

  assert.equal(reply.message.body, 'legacy reply');
});

test('deleteMessage falls back to deleted_by when deleted_by_empid is unavailable', async () => {
  const db = new FakeDb({ deleteByColumn: 'deleted_by' });
  const session = { permissions: { messaging: true } };

  const created = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'delete me', linkedType: 'topic', linkedId: 'delete-legacy', idempotencyKey: 'delete-legacy-1' },
    correlationId: 'delete-legacy-1',
    db,
    getSession: async () => session,
  });

  const deleted = await deleteMessage({
    user,
    companyId: 1,
    messageId: created.message.id,
    correlationId: 'delete-legacy-2',
    db,
    getSession: async () => session,
  });

  assert.equal(deleted.deleted, true);
  assert.equal(db.messages[0].deleted_by, user.empid);
});

test('deleteMessage still soft-deletes when deleted_by columns are unavailable', async () => {
  const db = new FakeDb({ deleteByColumn: 'none' });
  const session = { permissions: { messaging: true } };

  const created = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'delete fallback', linkedType: 'topic', linkedId: 'delete-fallback', idempotencyKey: 'delete-fallback-1' },
    correlationId: 'delete-fallback-1',
    db,
    getSession: async () => session,
  });

  const deleted = await deleteMessage({
    user,
    companyId: 1,
    messageId: created.message.id,
    correlationId: 'delete-fallback-2',
    db,
    getSession: async () => session,
  });

  assert.equal(deleted.deleted, true);
  assert.ok(db.messages[0].deleted_at);
});

test('rate limiter falls back locally when redis is unavailable', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true } };
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const created = await postMessage({
      user,
      companyId: 1,
      payload: { body: 'fallback redis down', linkedType: 'topic', linkedId: 'fallback', idempotencyKey: 'fallback-rl-1' },
      correlationId: 'fallback-rl-1',
      db,
      getSession: async () => session,
    });

    assert.equal(created.message.body, 'fallback redis down');
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
});
test('idempotency key returns same message without duplicate insert', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true } };

  const first = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'one', linkedType: 'transaction', linkedId: 'tx-1', idempotencyKey: 'idem-1' },
    correlationId: 'cor-1',
    db,
    getSession: async () => session,
  });

  const second = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'one', linkedType: 'transaction', linkedId: 'tx-1', idempotencyKey: 'idem-1' },
    correlationId: 'cor-2',
    db,
    getSession: async () => session,
  });

  assert.equal(first.message.id, second.message.id);
  assert.equal(second.message.body, first.message.body);
  assert.equal(second.idempotentReplay, true);
  assert.equal(db.messages.length, 1);
});



test('idempotency fallback works when expires_at column is unavailable', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true } };
  const originalQuery = db.query.bind(db);

  db.query = async (sql, params = []) => {
    if (sql.includes('erp_message_idempotency') && sql.includes('expires_at')) {
      const error = new Error("Unknown column 'expires_at' in 'field list'");
      error.sqlMessage = "Unknown column 'expires_at' in 'field list'";
      throw error;
    }
    return originalQuery(sql, params);
  };

  const created = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'legacy schema path', linkedType: 'topic', linkedId: 'legacy', idempotencyKey: 'legacy-1' },
    correlationId: 'legacy-1',
    db,
    getSession: async () => session,
  });

  const replay = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'legacy schema path', linkedType: 'topic', linkedId: 'legacy', idempotencyKey: 'legacy-1' },
    correlationId: 'legacy-2',
    db,
    getSession: async () => session,
  });

  assert.equal(created.message.id, replay.message.id);
  assert.equal(replay.idempotentReplay, true);
});
test('reply beyond max depth is rejected', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true } };

  let parent = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'root', linkedType: 'topic', linkedId: 'depth', idempotencyKey: 'depth-root' },
    correlationId: 'depth-root',
    db,
    getSession: async () => session,
  });

  for (let depth = 1; depth <= 5; depth += 1) {
    parent = await postReply({
      user,
      companyId: 1,
      messageId: parent.message.id,
      payload: { body: `reply-${depth}`, idempotencyKey: `depth-${depth}` },
      correlationId: `depth-${depth}`,
      db,
      getSession: async () => session,
    });
  }

  await assert.rejects(
    () =>
      postReply({
        user,
        companyId: 1,
        messageId: parent.message.id,
        payload: { body: 'too deep', idempotencyKey: 'depth-overflow' },
        correlationId: 'depth-overflow',
        db,
        getSession: async () => session,
      }),
    /Reply depth exceeds maximum of 5/,
  );
});

test('realtime fanout emits message.created to included users only', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true } };
  const emissions = [];

  setMessagingIo({
    to(room) {
      return {
        emit(event, payload) {
          emissions.push({ room, event, payload });
        },
      };
    },
  });

  await postMessage({
    user,
    companyId: 1,
    payload: {
      body: 'broadcast',
      linkedType: 'topic',
      linkedId: 'ops',
      visibilityScope: 'private',
      visibilityEmpid: 'e-2',
      idempotencyKey: 'fanout-1',
    },
    correlationId: 'fanout-cid',
    db,
    getSession: async () => session,
  });

  const listed = await getMessages({ user, companyId: 1, correlationId: 'fanout-cid', db, getSession: async () => session });
  assert.equal(listed.items.length, 1);
  assert.equal(emissions.some((entry) => entry.room === 'company:1'), false);
  assert.equal(emissions.some((entry) => entry.room === 'user:e-1' && entry.event === 'message.created'), true);
  assert.equal(emissions.some((entry) => entry.room === 'user:E-1' && entry.event === 'message.created'), true);
  assert.equal(emissions.some((entry) => entry.room === 'emp:e-1' && entry.event === 'message.created'), true);
  assert.equal(emissions.some((entry) => entry.room === 'user:e-2' && entry.event === 'message.created'), true);
});


test('private visibility hides messages from non-target users', async () => {
  const db = new FakeDb();
  const authorSession = { permissions: { messaging: true }, department_id: 10 };

  await postMessage({
    user,
    companyId: 1,
    payload: {
      body: 'secret',
      linkedType: 'topic',
      linkedId: 'ops-room',
      visibilityScope: 'private',
      visibilityEmpid: 'e-2',
      idempotencyKey: 'private-1',
    },
    correlationId: 'private-1',
    db,
    getSession: async () => authorSession,
  });

  const hidden = await getMessages({
    user: { empid: 'e-3', companyId: 1 },
    companyId: 1,
    correlationId: 'private-2',
    db,
    getSession: async () => ({ permissions: { messaging: true }, department_id: 10 }),
  });
  assert.equal(hidden.items.length, 0);

  const visible = await getMessages({
    user: { empid: 'e-2', companyId: 1 },
    companyId: 1,
    correlationId: 'private-3',
    db,
    getSession: async () => ({ permissions: { messaging: true }, department_id: 10 }),
  });
  assert.equal(visible.items.length, 1);
  assert.equal(visible.items[0].body, 'secret');
});

test('encrypted storage stores ciphertext when key is configured', async () => {
  const db = new FakeDb();
  const session = { permissions: { messaging: true }, department_id: 10 };
  process.env.MESSAGING_ENCRYPTION_KEY = 'unit-test-key';

  const created = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'encrypted hello', linkedType: 'topic', linkedId: 'ops', idempotencyKey: 'enc-1' },
    correlationId: 'enc-1',
    db,
    getSession: async () => session,
  });

  assert.equal(created.message.body, 'encrypted hello');
  assert.equal(db.messages[0].body, null);
  assert.ok(db.messages[0].body_ciphertext);
  delete process.env.MESSAGING_ENCRYPTION_KEY;
});


test('permission denial writes to security audit events table', async () => {
  const db = new FakeDb();
  const allowSession = { permissions: { messaging: true }, department_id: 10 };

  const created = await postMessage({
    user,
    companyId: 1,
    payload: { body: 'owned message', linkedType: 'topic', linkedId: 'ops', idempotencyKey: 'owned-1' },
    correlationId: 'owned-1',
    db,
    getSession: async () => allowSession,
  });

  await assert.rejects(
    () =>
      patchMessage({
        user: { empid: 'e-2', companyId: 1 },
        companyId: 1,
        messageId: created.message.id,
        payload: { body: 'unauthorized edit' },
        correlationId: 'denied-1',
        db,
        getSession: async () => allowSession,
      }),
    /Messaging permission denied/,
  );

  assert.equal(db.securityAuditEvents.length, 1);
  assert.equal(db.securityAuditEvents[0].event, 'messaging.permission_denied');
});

test.afterEach(() => {
  resetMessagingMetrics();
});

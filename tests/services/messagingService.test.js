import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteMessage, getMessages, postMessage, setMessagingIo } from '../../api-server/services/messagingService.js';

class FakeDb {
  constructor() {
    this.messages = [];
    this.idem = new Map();
    this.nextId = 1;
  }

  async query(sql, params = []) {
    if (sql.includes('CREATE TABLE IF NOT EXISTS')) return [[]];
    if (sql.startsWith('SELECT message_id FROM erp_message_idempotency')) {
      const [companyId, empid, key] = params;
      const messageId = this.idem.get(`${companyId}:${empid}:${key}`);
      return [messageId ? [{ message_id: messageId }] : []];
    }
    if (sql.startsWith('INSERT INTO erp_messages')) {
      const [companyId, authorEmpid, parentId, linkedType, linkedId, body] = params;
      const message = {
        id: this.nextId++,
        company_id: companyId,
        author_empid: authorEmpid,
        parent_message_id: parentId,
        linked_type: linkedType,
        linked_id: linkedId,
        body,
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
    if (sql.startsWith('UPDATE erp_messages SET deleted_at')) {
      const [empid, id, companyId] = params;
      const match = this.messages.find((entry) => entry.id === id && entry.company_id === companyId);
      if (match) {
        match.deleted_at = new Date().toISOString();
        match.deleted_by_empid = empid;
      }
      return [{ affectedRows: match ? 1 : 0 }];
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
  assert.equal(second.idempotentReplay, true);
});

test('realtime fanout emits message.created into company room', async () => {
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
    payload: { body: 'broadcast', linkedType: 'topic', linkedId: 'ops', idempotencyKey: 'fanout-1' },
    correlationId: 'fanout-cid',
    db,
    getSession: async () => session,
  });

  const listed = await getMessages({ user, companyId: 1, correlationId: 'fanout-cid', db, getSession: async () => session });
  assert.equal(listed.items.length, 1);
  assert.equal(emissions.length, 1);
  assert.equal(emissions[0].room, 'company:1');
  assert.equal(emissions[0].event, 'message.created');
});

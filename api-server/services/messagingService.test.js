import test from 'node:test';
import assert from 'node:assert/strict';

import { postMessage } from './messagingService.js';

class MockDb {
  constructor() {
    this.nextId = 100;
    this.messages = [
      {
        id: 11,
        company_id: 1,
        author_empid: 'E100',
        parent_message_id: null,
        conversation_id: null,
        linked_type: null,
        linked_id: null,
        visibility_scope: 'private',
        visibility_department_id: null,
        visibility_empid: 'E100,E200',
        body: 'Existing conversation root',
        deleted_at: null,
      },
    ];
  }

  async query(sql, params = []) {
    const text = String(sql);

    if (text.includes('information_schema.TABLES') && text.includes("TABLE_NAME = 'erp_messages'")) {
      return [[{ count: 1 }], undefined];
    }

    if (text.startsWith('CALL create_tenant_temp_table')) {
      return [[], undefined];
    }

    if (text.includes('FROM') && text.includes('erp_message_idempotency') && text.includes('SELECT')) {
      return [[/* no previous idempotency row */], undefined];
    }

    if (text.includes('INSERT INTO erp_message_idempotency')) {
      return [{ affectedRows: 1 }, undefined];
    }

    if (text.includes('SELECT * FROM') && text.includes('erp_messages') && text.includes('WHERE id = ? LIMIT 1')) {
      const id = Number(params[0]);
      const row = this.messages.find((entry) => Number(entry.id) === id) || null;
      return [[row].filter(Boolean), undefined];
    }

    if (text.includes('INSERT INTO erp_messages')) {
      const parentMessageId = params[2] == null ? null : Number(params[2]);
      const parent = parentMessageId ? this.messages.find((entry) => Number(entry.id) === parentMessageId) : null;
      const newId = this.nextId++;
      const message = {
        id: newId,
        company_id: Number(params[0]),
        author_empid: params[1],
        parent_message_id: parentMessageId,
        conversation_id: parent ? Number(parent.conversation_id || parent.id) : null,
        linked_type: params[3] ?? null,
        linked_id: params[4] ?? null,
        visibility_scope: params[5] ?? 'company',
        visibility_department_id: params[6] ?? null,
        visibility_empid: params[7] ?? null,
        body: params[8] ?? '',
        deleted_at: null,
      };
      this.messages.push(message);
      return [{ insertId: newId }, undefined];
    }

    if (text.includes('INSERT INTO security_audit_events')) {
      return [{ affectedRows: 1 }, undefined];
    }

    throw new Error(`Unexpected query: ${text}`);
  }
}

test('postMessage keeps conversation_id when posting into an existing conversation', async () => {
  const db = new MockDb();
  const result = await postMessage({
    user: { empid: 'E100', companyId: 1 },
    companyId: 1,
    payload: {
      idempotencyKey: 'idem-1',
      body: 'Follow-up without explicit reply target',
      conversationId: 11,
      recipientEmpids: ['E100', 'E200'],
    },
    correlationId: 'corr-1',
    db,
    getSession: async () => ({
      department_id: 10,
      permissions: { system_settings: true },
    }),
  });

  assert.equal(Number(result?.message?.conversation_id), 11);
  assert.equal(Number(result?.message?.parent_message_id), 11);
});

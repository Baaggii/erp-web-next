import test from 'node:test';
import assert from 'node:assert/strict';

import { adaptConversationListResponse, adaptThreadResponse } from '../../src/erp.mgt.mn/components/messagingApiAdapters.js';

test('adaptConversationListResponse normalizes strict backend list payload', () => {
  const adapted = adaptConversationListResponse({
    items: [
      {
        id: 15,
        type: 'private',
        linked_type: 'sales_order',
        linked_id: 44,
        last_message_at: '2026-01-02T03:04:05.000Z',
        last_message_id: 901,
        participants: [{ empid: 'E100' }, { empid: 'E200' }],
      },
    ],
    pageInfo: { page: 1, limit: 20 },
  });

  assert.deepEqual(adapted.items[0], {
    id: 'conversation:15',
    conversationId: '15',
    title: 'sales_order #44',
    linkedType: 'sales_order',
    linkedId: '44',
    type: 'private',
    isGeneral: false,
    lastMessageAt: '2026-01-02T03:04:05.000Z',
    lastMessageId: '901',
    participants: ['E100', 'E200'],
    unread: 0,
    raw: {
      id: 15,
      type: 'private',
      linked_type: 'sales_order',
      linked_id: 44,
      last_message_at: '2026-01-02T03:04:05.000Z',
      last_message_id: 901,
      participants: [{ empid: 'E100' }, { empid: 'E200' }],
    },
  });
  assert.deepEqual(adapted.pageInfo, { page: 1, limit: 20 });
});

test('adaptThreadResponse normalizes thread items with guaranteed conversation_id', () => {
  const adapted = adaptThreadResponse({
    conversationId: '77',
    items: [
      { id: 1, body: 'root' },
      { id: 2, body: 'reply', conversation_id: 77 },
    ],
    pageInfo: { page: 1, hasNextPage: false },
  });

  assert.equal(adapted.conversationId, '77');
  assert.equal(adapted.items[0].id, '1');
  assert.equal(adapted.items[0].conversation_id, '77');
  assert.equal(adapted.items[1].id, '2');
  assert.equal(adapted.items[1].conversation_id, '77');
  assert.deepEqual(adapted.pageInfo, { page: 1, hasNextPage: false });
});


test('adaptConversationListResponse marks type=general conversation as general', () => {
  const adapted = adaptConversationListResponse({
    items: [{ id: 5, type: 'general', linked_type: null, linked_id: null }],
  });

  assert.equal(adapted.items[0].isGeneral, true);
  assert.equal(adapted.items[0].title, 'General');
});

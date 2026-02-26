import test from 'node:test';
import assert from 'node:assert/strict';

import { adaptConversationListResponse, adaptThreadResponse } from '../../src/erp.mgt.mn/components/messagingApiAdapters.js';

test('adaptConversationListResponse normalizes strict backend list payload', () => {
  const adapted = adaptConversationListResponse({
    items: [
      {
        id: 15,
        linked_type: 'sales_order',
        linked_id: 44,
        visibility_scope: 'private',
        last_message_at: '2026-01-02T03:04:05.000Z',
        last_message_id: 901,
      },
    ],
    pageInfo: { page: 1, limit: 20 },
  });

  assert.deepEqual(adapted.items[0], {
    id: 'conversation:15',
    conversationId: 15,
    title: 'sales_order #44',
    linkedType: 'sales_order',
    linkedId: '44',
    visibilityScope: 'private',
    lastMessageAt: '2026-01-02T03:04:05.000Z',
    lastMessageId: '901',
    unread: 0,
    raw: {
      id: 15,
      linked_type: 'sales_order',
      linked_id: 44,
      visibility_scope: 'private',
      last_message_at: '2026-01-02T03:04:05.000Z',
      last_message_id: 901,
    },
  });
  assert.deepEqual(adapted.pageInfo, { page: 1, limit: 20 });
});

test('adaptThreadResponse normalizes thread items with guaranteed conversation_id', () => {
  const adapted = adaptThreadResponse({
    conversationId: 77,
    items: [
      { id: 1, body: 'root' },
      { id: 2, body: 'reply', conversation_id: 77 },
    ],
    pageInfo: { page: 1, hasNextPage: false },
  });

  assert.equal(adapted.conversationId, 77);
  assert.equal(adapted.items[0].conversation_id, 77);
  assert.equal(adapted.items[1].conversation_id, 77);
  assert.deepEqual(adapted.pageInfo, { page: 1, hasNextPage: false });
});

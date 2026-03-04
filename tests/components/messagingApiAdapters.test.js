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
    conversationId: '15',
    topic: 'sales_order #44',
    title: 'sales_order #44',
    type: 'private',
    linkedType: 'sales_order',
    linkedId: '44',
    participants: [],
    visibilityScope: 'private',
    isGeneral: false,
    lastMessageAt: '2026-01-02T03:04:05.000Z',
    lastMessageId: '901',
    unread: 0,
    createdByEmpid: null,
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


test('adaptConversationListResponse marks company-wide unlinked conversation as general', () => {
  const adapted = adaptConversationListResponse({
    items: [{ id: 5, linked_type: null, linked_id: null, visibility_scope: 'company' }],
  });

  assert.equal(adapted.items[0].isGeneral, true);
  assert.equal(adapted.items[0].conversationId, '5');
  assert.equal(adapted.items[0].id, 'conversation:5');
  assert.equal(adapted.items[0].title, 'General');
});



test('adaptConversationListResponse sorts by most recent last message regardless of general channel', () => {
  const adapted = adaptConversationListResponse({
    items: [
      { id: 8, type: 'general', visibility_scope: 'company', last_message_at: '2026-01-01T03:00:00.000Z' },
      { id: 12, type: 'private', visibility_scope: 'private', last_message_at: '2026-01-03T03:00:00.000Z' },
      { id: 10, type: 'private', visibility_scope: 'private', last_message_at: '2026-01-02T03:00:00.000Z' },
    ],
  });

  assert.deepEqual(adapted.items.map((entry) => entry.id), ['conversation:12', 'conversation:10', 'conversation:8']);
});



test('adaptConversationListResponse falls back to lastMessageId ordering when timestamp is missing', () => {
  const adapted = adaptConversationListResponse({
    items: [
      { id: 6, type: 'private', visibility_scope: 'private', last_message_at: null, last_message_id: 301 },
      { id: 7, type: 'private', visibility_scope: 'private', last_message_at: null, last_message_id: 305 },
      { id: 8, type: 'private', visibility_scope: 'private', last_message_at: null, last_message_id: 302 },
    ],
  });

  assert.deepEqual(adapted.items.map((entry) => entry.id), ['conversation:7', 'conversation:8', 'conversation:6']);
});

test('adaptConversationListResponse does not synthesize non-numeric general conversation ids', () => {
  const adapted = adaptConversationListResponse({
    items: [
      { id: 'general', type: 'general', visibility_scope: 'company' },
      { id: 9, type: 'general', visibility_scope: 'company' },
    ],
  });

  assert.equal(adapted.items.length, 1);
  assert.equal(adapted.items[0].conversationId, '9');
  assert.equal(adapted.items[0].id, 'conversation:9');
});

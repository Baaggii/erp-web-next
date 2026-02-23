import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERAL_CONVERSATION_ID,
  collectMessageParticipantEmpids,
  filterVisibleMessages,
  groupConversations,
  shouldWarnOnAddRecipient,
} from '../messagingConversationUtils.js';
import { createInitialWidgetState, messagingWidgetReducer } from '../messagingWidgetModel.js';

test('collectMessageParticipantEmpids uses explicit participant fields and ignores read_by artifacts', () => {
  const participants = collectMessageParticipantEmpids({
    author_empid: 'u1',
    participant_empids: ['u2'],
    recipient_empids: ['u3'],
    read_by: ['u4'],
  });
  assert.deepEqual(participants.sort(), ['u1', 'u2', 'u3']);
});

test('filterVisibleMessages hides private conversations from non-participants', () => {
  const messages = [
    { id: 1, body: 'private root', visibility_scope: 'private', participant_empids: ['author', 'alice'], author_empid: 'author' },
    { id: 2, parent_message_id: 1, body: 'reply', visibility_scope: 'private', participant_empids: ['author', 'alice'], author_empid: 'alice' },
    { id: 3, body: 'company', visibility_scope: 'company', author_empid: 'author' },
  ];

  const visibleToAlice = filterVisibleMessages(messages, 'alice').map((m) => m.id);
  const visibleToBob = filterVisibleMessages(messages, 'bob').map((m) => m.id);

  assert.deepEqual(visibleToAlice, [1, 2, 3]);
  assert.deepEqual(visibleToBob, [3]);
});

test('groupConversations keeps General first and only projects private conversations to participants', () => {
  const messages = [
    { id: 10, body: 'company hello', visibility_scope: 'company', author_empid: 'admin', created_at: '2024-01-02T00:00:00Z' },
    { id: 11, body: 'p1', visibility_scope: 'private', participant_empids: ['admin', 'alice'], author_empid: 'admin', created_at: '2024-01-03T00:00:00Z' },
    { id: 12, parent_message_id: 11, body: 'p1 reply', visibility_scope: 'private', participant_empids: ['admin', 'alice'], author_empid: 'alice', created_at: '2024-01-03T01:00:00Z' },
  ];

  const aliceConversations = groupConversations(messages, 'alice');
  const bobConversations = groupConversations(messages, 'bob');

  assert.equal(aliceConversations[0].id, GENERAL_CONVERSATION_ID);
  assert.equal(aliceConversations.length, 2);
  assert.equal(bobConversations.length, 1);
  assert.equal(bobConversations[0].id, GENERAL_CONVERSATION_ID);
});

test('shouldWarnOnAddRecipient only warns for non-participants in private conversation', () => {
  const privateConversation = { id: 'c1', isGeneral: false, visibilityScope: 'private' };
  assert.equal(shouldWarnOnAddRecipient({
    isDraftConversation: false,
    activeConversation: privateConversation,
    conversationParticipantIds: new Set(['u1']),
    recipientId: 'u2',
  }), true);

  assert.equal(shouldWarnOnAddRecipient({
    isDraftConversation: false,
    activeConversation: privateConversation,
    conversationParticipantIds: new Set(['u1']),
    recipientId: 'u1',
  }), false);

  assert.equal(shouldWarnOnAddRecipient({
    isDraftConversation: false,
    activeConversation: { id: 'general', isGeneral: true, visibilityScope: 'company' },
    conversationParticipantIds: new Set(['u1']),
    recipientId: 'u2',
  }), false);
});

test('conversation selection clears reply mode while keeping send path active', () => {
  const state = {
    ...createInitialWidgetState(),
    composer: { ...createInitialWidgetState().composer, replyToId: '45', body: 'hello' },
  };
  const next = messagingWidgetReducer(state, { type: 'widget/setConversation', payload: 'message:12' });
  assert.equal(next.activeConversationId, 'message:12');
  assert.equal(next.composer.replyToId, null);
  assert.equal(next.composer.body, 'hello');
});

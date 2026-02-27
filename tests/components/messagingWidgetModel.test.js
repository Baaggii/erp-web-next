import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionStorageKey,
  createInitialWidgetState,
  excludeGeneralConversationSummaries,
  messagingWidgetReducer,
  prioritizeConversationSummaries,
  resolvePresenceStatus,
  normalizeConversationId,
  safePreviewableFile,
  sanitizeMessageText,
} from '../../src/erp.mgt.mn/components/messagingWidgetModel.js';

test('buildSessionStorageKey namespaces by session', () => {
  assert.equal(buildSessionStorageKey('u1', 'open'), 'messaging-widget:u1:open');
  assert.equal(buildSessionStorageKey('', 'open'), 'messaging-widget:anonymous:open');
});

test('sanitizeMessageText strips tags and control chars', () => {
  assert.equal(sanitizeMessageText('Hello <script>alert(1)</script>\u0001 world'), 'Hello alert(1) world');
});

test('safePreviewableFile allows image/pdf/text and blocks others', () => {
  assert.equal(safePreviewableFile({ type: 'image/png' }), true);
  assert.equal(safePreviewableFile({ type: 'application/pdf' }), true);
  assert.equal(safePreviewableFile({ type: 'application/zip' }), false);
});

test('messagingWidgetReducer resets state on company switch', () => {
  const initial = createInitialWidgetState({ isOpen: true, activeConversationId: 'thread-1', companyId: 'A' });
  const withBody = messagingWidgetReducer(initial, { type: 'composer/setBody', payload: 'draft' });
  const switched = messagingWidgetReducer(withBody, { type: 'company/switch', payload: 'B' });

  assert.equal(switched.isOpen, true);
  assert.equal(switched.activeCompanyId, 'B');
  assert.equal(switched.activeConversationId, null);
  assert.equal(switched.composer.body, '');
});

test('messagingWidgetReducer conversation load lifecycle stores conversation order by company', () => {
  const initial = createInitialWidgetState({ companyId: 'A' });
  const loading = messagingWidgetReducer(initial, {
    type: 'conversations/loadStart',
    payload: { companyKey: 'company:A' },
  });
  assert.equal(loading.threadStateByCompany['company:A'].conversationsStatus, 'loading');

  const success = messagingWidgetReducer(loading, {
    type: 'conversations/loadSuccess',
    payload: {
      companyKey: 'company:A',
      items: [
        { conversationId: 8, id: 'conversation:8' },
        { conversationId: 12, id: 'conversation:12' },
      ],
    },
  });
  assert.deepEqual(success.conversationOrderByCompany['company:A'], ['8', '12']);
  assert.equal(success.threadStateByCompany['company:A'].conversationsStatus, 'ready');
});

test('composer start and reset clear reply target state', () => {
  const initial = createInitialWidgetState({ activeConversationId: 'conversation:101', companyId: 'A' });
  const withReplyTo = messagingWidgetReducer(initial, { type: 'composer/setReplyTo', payload: '88' });
  const started = messagingWidgetReducer(withReplyTo, { type: 'composer/start', payload: { conversationId: '__new__' } });

  assert.equal(started.activeConversationId, '__new__');
  assert.equal(started.composer.replyToId, null);

  const withReplyAgain = messagingWidgetReducer(started, { type: 'composer/setReplyTo', payload: '42' });
  const reset = messagingWidgetReducer(withReplyAgain, { type: 'composer/reset' });
  assert.equal(reset.composer.replyToId, null);
});


test('resolvePresenceStatus marks stale online users as away or offline', () => {
  const now = new Date('2026-01-01T00:10:00.000Z').getTime();

  assert.equal(
    resolvePresenceStatus({ status: 'online', heartbeat_at: '2026-01-01T00:09:20.000Z' }, now),
    'online',
  );
  assert.equal(
    resolvePresenceStatus({ status: 'online', heartbeat_at: '2026-01-01T00:08:20.000Z' }, now),
    'away',
  );
  assert.equal(
    resolvePresenceStatus({ status: 'online', heartbeat_at: '2026-01-01T00:07:20.000Z' }, now),
    'offline',
  );
});






test('normalizeConversationId strips UI prefix', () => {
  assert.equal(normalizeConversationId('conversation:44'), '44');
  assert.equal(normalizeConversationId(55), '55');
  assert.equal(normalizeConversationId(''), null);
});
test('excludeGeneralConversationSummaries hides general channel entries', () => {
  const filtered = excludeGeneralConversationSummaries([
    { id: 'general', isGeneral: true },
    { id: 'conversation:1', isGeneral: false },
    { id: '__new__', isDraft: true, isGeneral: false },
  ]);

  assert.deepEqual(filtered.map((entry) => entry.id), ['conversation:1', '__new__']);
});


test('prioritizeConversationSummaries keeps general channel first and includes it without messages', () => {
  const summaries = prioritizeConversationSummaries(
    [
      { id: 'conversation:2', isGeneral: false, messages: [{ id: 2 }] },
      { id: 'general', isGeneral: true, messages: [] },
      { id: 'conversation:1', isGeneral: false, messages: [{ id: 1 }] },
      { id: 'conversation:empty', isGeneral: false, messages: [] },
    ],
    { id: '__new__', isDraft: true, isGeneral: false, messages: [] },
  );

  assert.deepEqual(summaries.map((entry) => entry.id), ['general', '__new__', 'conversation:2', 'conversation:1']);
});

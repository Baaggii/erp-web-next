import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionStorageKey,
  createInitialWidgetState,
  messagingWidgetReducer,
  resolvePresenceStatus,
  resolveThreadRefreshRootId,
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

test('composer start and reset clear reply target state', () => {
  const initial = createInitialWidgetState({ activeConversationId: 'message:101', companyId: 'A' });
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


test('resolveThreadRefreshRootId keeps replies inside the active thread root', () => {
  const createdNestedReply = { id: 22, parent_message_id: 15 };
  assert.equal(
    resolveThreadRefreshRootId({
      isReplyMode: true,
      fallbackRootReplyTargetId: '8',
      createdMessage: createdNestedReply,
    }),
    '8',
  );

  assert.equal(
    resolveThreadRefreshRootId({
      isReplyMode: false,
      fallbackRootReplyTargetId: '8',
      createdMessage: { id: 30 },
    }),
    '30',
  );
});

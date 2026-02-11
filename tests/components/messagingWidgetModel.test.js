import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionStorageKey,
  createInitialWidgetState,
  messagingWidgetReducer,
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

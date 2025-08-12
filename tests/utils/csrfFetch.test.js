import test from 'node:test';
import assert from 'node:assert/strict';

class CustomEvt {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

test('csrfFetch surfaces server errors as Service unavailable', async () => {
  const events = [];
  global.CustomEvent = CustomEvt;
  global.window = {
    __activeTabKey: undefined,
    location: { hash: '' },
    dispatchEvent: (evt) => events.push(evt),
    fetch: async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: { get: () => 'text/html' },
      text: async () => '<html><body>503</body></html>',
    }),
  };

  await import('../../src/erp.mgt.mn/utils/csrfFetch.js');
  await window.fetch('/api/auth/login');

  const toast = events.find((e) => e.type === 'toast');
  assert.ok(toast, 'toast event dispatched');
  assert.equal(toast.detail.message, '❌ Request failed: Service unavailable');
});

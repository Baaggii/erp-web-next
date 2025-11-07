import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

test('csrf-aware fetch maps HTML failures to a service unavailable toast', async (t) => {
  const toasts = [];

  class TestEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  global.CustomEvent = TestEvent;

  const underlyingFetch = mock.fn(async (url) => {
    if (typeof url === 'string' && url.endsWith('/csrf-token')) {
      const response = {
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ csrfToken: 'token-123' }),
        clone() { return this; },
      };
      response.headers.get = response.headers.get.bind(response.headers);
      return response;
    }

    const response = {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Map([[
        'content-type',
        'text/html; charset=UTF-8',
      ]]),
      clone() { return this; },
      json: async () => { throw new Error('not json'); },
      text: async () => '<!DOCTYPE html><html></html>',
    };
    response.headers.get = response.headers.get.bind(response.headers);
    return response;
  });

  const windowMock = {
    fetch: underlyingFetch,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: mock.fn((event) => {
      if (event?.type === 'toast') {
        toasts.push(event);
      }
      return true;
    }),
    location: { hash: '' },
  };

  global.window = windowMock;

  t.after(() => {
    delete global.window;
    delete global.CustomEvent;
  });

  await import('../../src/erp.mgt.mn/utils/csrfFetch.js');

  const response = await window.fetch('/api/auth/login', { method: 'POST' });
  assert.equal(response.status, 503);

  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, 'toast');
  assert.equal(toasts[0].detail?.message, 'Request failed: Service unavailable');
  assert.equal(toasts[0].detail?.type, 'error');
});

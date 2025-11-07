import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import { login } from '../../src/erp.mgt.mn/hooks/useAuth.js';

const originalFetch = global.fetch;
const originalLocalStorage = global.localStorage;

function resetEnv() {
  global.fetch = originalFetch;
  if (originalLocalStorage === undefined) {
    delete global.localStorage;
  } else {
    global.localStorage = originalLocalStorage;
  }
}

function installLocalStorageMock() {
  global.localStorage = {
    getItem: mock.fn(() => null),
    setItem: mock.fn(() => {}),
    removeItem: mock.fn(() => {}),
  };
}

test('login surfaces network failures with a friendly error', { concurrency: 1 }, async (t) => {
  t.after(resetEnv);
  installLocalStorageMock();

  global.fetch = mock.fn(async () => {
    throw new Error('network down');
  });

  await assert.rejects(
    login({ empid: '123', password: 'secret' }),
    (err) => err instanceof Error && /Login request failed/i.test(err.message),
  );
});

test('login reports service unavailability when CSRF token cannot be fetched', { concurrency: 1 }, async (t) => {
  t.after(resetEnv);
  installLocalStorageMock();

  const tokenError = new Error('token missing');
  tokenError.code = 'CSRF_TOKEN_UNAVAILABLE';

  global.fetch = mock.fn(async () => {
    throw tokenError;
  });

  await assert.rejects(
    login({ empid: '123', password: 'secret' }),
    (err) => err instanceof Error && /Service unavailable/i.test(err.message),
  );
});

test('login maps 503 HTML responses to the service unavailable error', { concurrency: 1 }, async (t) => {
  t.after(resetEnv);
  installLocalStorageMock();

  global.fetch = mock.fn(async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type'
          ? 'text/html; charset=UTF-8'
          : null;
      },
    },
    json: async () => { throw new Error('not json'); },
    text: async () => '<!DOCTYPE html><html></html>',
  }));

  await assert.rejects(
    login({ empid: '123', password: 'secret' }),
    (err) => err instanceof Error && /Service unavailable/i.test(err.message),
  );
});

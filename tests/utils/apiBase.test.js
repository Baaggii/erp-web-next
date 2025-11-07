import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../../src/erp.mgt.mn/utils/apiBase.js', import.meta.url);

async function loadApiBase({ pathname, runtimeBase } = {}) {
  if (pathname === undefined) {
    delete global.window;
  } else {
    global.window = { location: { pathname } };
  }

  if (runtimeBase === undefined) {
    delete globalThis.__ERP_API_BASE__;
  } else {
    globalThis.__ERP_API_BASE__ = runtimeBase;
  }

  const spec = `${moduleUrl.href}?t=${Math.random()}`;
  return import(spec);
}

test('API_BASE falls back to /api by default', async () => {
  const mod = await loadApiBase();
  assert.equal(mod.API_BASE, '/api');
  assert.equal(mod.API_ROOT, '');
});

test('API_BASE infers subdirectory from window.location', async () => {
  const mod = await loadApiBase({ pathname: '/erp/' });
  assert.equal(mod.API_BASE, '/erp/api');
  assert.equal(mod.API_ROOT, '/erp');
});

test('runtime override takes precedence over detected base', async () => {
  const runtimeBase = 'https://backend.example.com/api';
  const mod = await loadApiBase({ pathname: '/erp/', runtimeBase });
  assert.equal(mod.API_BASE, runtimeBase);
  assert.equal(mod.API_ROOT, 'https://backend.example.com');
});

test.after(() => {
  delete global.window;
  delete globalThis.__ERP_API_BASE__;
});


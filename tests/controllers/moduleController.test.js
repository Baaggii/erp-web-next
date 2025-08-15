import test from 'node:test';
import assert from 'node:assert/strict';
import * as controller from '../../api-server/controllers/moduleController.js';
import * as db from '../../db/index.js';

function mockPool(handler) {
  const orig = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = orig;
  };
}

function createRes() {
  return {
    code: undefined,
    body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; },
    sendStatus(c) { this.code = c; },
  };
}

test('saveModule blocks updates from form-management origin', async () => {
  let called = false;
  const restore = mockPool(async () => { called = true; return [{}]; });
  const req = {
    params: {},
    body: { moduleKey: 'test', label: 'Test' },
    headers: { 'x-origin': 'form-management' },
    get(name) { return this.headers[name.toLowerCase()]; },
    user: { position: 'admin', email: 'a@example.com' },
  };
  const res = createRes();
  await controller.saveModule(req, res, () => {});
  restore();
  assert.equal(res.code, 403);
  assert.match(res.body.message, /Forbidden/);
  assert.equal(called, false);
});

test('saveModule allows admin update', async () => {
  let called = false;
  const restore = mockPool(async () => { called = true; return [{}]; });
  const req = {
    params: { moduleKey: 'x' },
    body: { label: 'X' },
    headers: {},
    get(name) { return this.headers[name.toLowerCase()]; },
    user: { position: 'admin', email: 'b@example.com' },
  };
  const res = createRes();
  await controller.saveModule(req, res, () => {});
  restore();
  assert.equal(called, true);
  assert.deepEqual(res.body, {
    moduleKey: 'x',
    label: 'X',
    parentKey: null,
    showInSidebar: true,
    showInHeader: false,
  });
});

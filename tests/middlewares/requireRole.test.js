import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole, requireRoles } from '../../api-server/middlewares/auth.js';

function mockReq(role) {
  return { user: { role } };
}

function mockRes() {
  return {
    statusCode: 0,
    sent: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.sent = obj; },
  };
}

test('requireRole allows matching role', () => {
  const middleware = requireRole('admin');
  const req = mockReq('admin');
  const res = mockRes();
  let called = false;
  middleware(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 0);
});

test('requireRole blocks non matching role', () => {
  const middleware = requireRole('admin');
  const req = mockReq('user');
  const res = mockRes();
  let called = false;
  middleware(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('requireRoles allows any listed role', () => {
  const middleware = requireRoles(['admin', 'employee']);
  const req = mockReq('employee');
  const res = mockRes();
  let called = false;
  middleware(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 0);
});

test('requireRoles blocks missing role', () => {
  const middleware = requireRoles(['admin', 'employee']);
  const req = mockReq('guest');
  const res = mockRes();
  let called = false;
  middleware(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

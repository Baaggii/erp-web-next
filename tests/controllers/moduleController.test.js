import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPoolSequential(responses = []) {
  const orig = db.pool.query;
  let i = 0;
  db.pool.query = async (...args) => {
    const res = responses[i];
    i += 1;
    if (typeof res === 'function') {
      return res(...args);
    }
    return res;
  };
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
  const controller = await import('../../api-server/controllers/moduleController.js?test=1');
  let called = false;
  const restore = mockPoolSequential([
    () => {
      called = true;
      return [{}];
    },
  ]);
  const req = {
    params: {},
    body: { moduleKey: 'test', label: 'Test' },
    headers: { 'x-origin': 'form-management' },
    get(name) { return this.headers[name.toLowerCase()]; },
    user: { empid: 1, companyId: 1, email: 'a@example.com' },
  };
  const res = createRes();
  await controller.saveModule(req, res, () => {});
  restore();
  assert.equal(res.code, 403);
  assert.match(res.body.message, /Forbidden/);
  assert.equal(called, false);
});

test('saveModule allows update with system_settings permission', async () => {
  const controller = await import('../../api-server/controllers/moduleController.js?test=2');
  const restore = mockPoolSequential([
    [[]],
    [[{ action: 'permission', action_key: 'system_settings' }]],
    [[]],
    [{}],
    [{}],
  ]);
  const req = {
    params: { moduleKey: 'x' },
    body: { label: 'X' },
    headers: {},
    get(name) { return this.headers[name.toLowerCase()]; },
    user: { empid: 1, companyId: 0, userLevel: 1, email: 'b@example.com' },
  };
  const res = createRes();
  await controller.saveModule(req, res, () => {});
  restore();
  assert.deepEqual(res.body, {
    moduleKey: 'x',
    label: 'X',
    parentKey: null,
    showInSidebar: true,
    showInHeader: false,
  });
});

test('populatePermissions succeeds with system_settings permission', async () => {
  const controller = await import('../../api-server/controllers/moduleController.js?test=3');
  let calls = 0;
  const orig = db.pool.query;
  db.pool.query = async (...args) => {
    calls++;
    if (calls === 1) {
      return [[{
        company_id: 1,
        company_name: 'Comp',
        branch_id: 1,
        branch_name: 'Branch',
        department_id: 1,
        department_name: 'Dept',
        position_id: 1,
        senior_empid: null,
        employee_name: 'Emp',
        user_level: 1,
        user_level_name: 'Admin',
        permission_list: 'system_settings',
      }]];
    }
    return [[]];
  };
  const req = { user: { empid: 1, companyId: 1 } };
  const res = createRes();
  await controller.populatePermissions(req, res, () => {});
  db.pool.query = orig;
  assert.equal(res.code, 204);
  assert.ok(calls > 1);
});

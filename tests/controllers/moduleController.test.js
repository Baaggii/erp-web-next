import test from 'node:test';
import assert from 'node:assert/strict';
import * as controller from '../../api-server/controllers/moduleController.js';
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

test.skip('saveModule allows update with permission', async () => {
  const responses = [
    [[]],
    [[]],
    [[]],
    [[]],
    [
      [
        {
          company_id: 1,
          branch_id: 1,
          department_id: 1,
          position_id: 1,
          position: 'admin',
          employee_name: 'Emp',
          user_level: 1,
          new_records: 0,
          edit_delete_request: 0,
          edit_records: 0,
          delete_records: 0,
          image_handler: 0,
          audition: 0,
          supervisor: 0,
          companywide: 0,
          branchwide: 0,
          departmentwide: 0,
          developer: 0,
          common_settings: 0,
          system_settings: 1,
          license_settings: 0,
          ai: 0,
          dashboard: 0,
          ai_dashboard: 0,
        },
      ],
    ],
    [[{}]],
  ];
  let callCount = 0;
  const restore = mockPoolSequential(responses.map((r) => (typeof r === 'function' ? r : () => { callCount++; return r; })));
  const req = {
    params: { moduleKey: 'x' },
    body: { label: 'X' },
    headers: {},
    get(name) { return this.headers[name.toLowerCase()]; },
    user: { empid: 1, companyId: 1, email: 'b@example.com' },
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../../api-server/controllers/authController.js';
import * as db from '../../db/index.js';

function mockPoolSequential(responses = []) {
  const orig = db.pool.query;
  let i = 0;
  db.pool.query = async (...args) => {
    const res = responses[i];
    i += 1;
    if (typeof res === 'function') return res(...args);
    return res;
  };
  return () => {
    db.pool.query = orig;
  };
}

function createRes() {
  return {
    code: 200,
    body: undefined,
    cookies: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; },
    cookie(name, val) { this.cookies[name] = val; },
  };
}

test('login prompts for company selection when companyId undefined', async () => {
  const sessions = [
    { company_id: 0, branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, employee_name: 'Emp0', user_level: 1, user_level_name: 'Admin', permission_list: '' },
    { company_id: 1, branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, employee_name: 'Emp1', user_level: 1, user_level_name: 'Admin', permission_list: '' },
  ];
  const restore = mockPoolSequential([
    [[{ id: 1, empid: 1, password: 'hashed' }]],
    [sessions],
    [[]],
    [[]],
  ]);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw' } }, res, () => {});
  restore();
  assert.equal(res.code, 200);
  assert.equal(res.body.needsCompany, true);
  assert.equal(res.body.sessions.length, sessions.length);
});

test('login succeeds when companyId is 0', async () => {
  const sessions = [
    { company_id: 0, branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, employee_name: 'Emp0', user_level: 1, user_level_name: 'Admin', permission_list: '' },
    { company_id: 1, branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, employee_name: 'Emp1', user_level: 1, user_level_name: 'Admin', permission_list: '' },
  ];
  const restore = mockPoolSequential([
    [[{ id: 1, empid: 1, password: 'hashed' }]],
    [sessions],
    [[]],
    [[]],
  ]);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw', companyId: 0 } }, res, () => {});
  restore();
  assert.equal(res.code, 200);
  assert.equal(res.body.company, 0);
  assert.equal(res.body.session.company_id, 0);
});

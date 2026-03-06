import test from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../../api-server/controllers/authController.js';
import * as db from '../../db/index.js';
import * as posSessions from '../../api-server/services/posSessionLogger.js';

process.env.SKIP_SCHEDULE_COLUMN_CHECK = '1';

function mockPoolSequential(responses = []) {
  const orig = db.pool.query;
  let i = 0;
  db.pool.query = async (...args) => {
    const sql = String(args[0] || '');
    const params = Array.isArray(args[1]) ? args[1] : [];
    if (sql.includes('FROM information_schema.COLUMNS')) {
      const tableName = String(params[0] || '');
      if (tableName === 'users') {
        return [[{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'empid' }, { COLUMN_NAME: 'password' }], undefined];
      }
      if (tableName === 'tbl_employee') {
        return [[{ COLUMN_NAME: 'emp_id' }, { COLUMN_NAME: 'emp_hiredate' }, { COLUMN_NAME: 'emp_outdate' }], undefined];
      }
      return [[{ COLUMN_NAME: 'id' }], undefined];
    }
    const res = responses[i];
    i += 1;
    if (typeof res === 'function') return res(...args);
    if (res !== undefined) return res;
    return [[], undefined];
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

function mockPosSessionLogger() {
  return posSessions.__test__.setRecorders({
    login: async () => ({ sessionUuid: 'mock-session', cookieName: 'pos_session_uuid' }),
    logout: async () => true,
  });
}

test('login prompts for company selection when companyId undefined', async () => {
  const restorePos = mockPosSessionLogger();
  const sessions = [
    { company_id: 0, company_name: 'Alpha', branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, senior_plan_empid: null, employee_name: 'Emp0', user_level: 1, user_level_name: 'Admin', permission_list: '', workplace_id: 5 },
    { company_id: 0, company_name: 'Alpha', branch_id: 2, department_id: 2, position_id: 2, position: 'Q', senior_empid: null, senior_plan_empid: null, employee_name: 'Emp0', user_level: 1, user_level_name: 'Admin', permission_list: '', workplace_id: 10 },
    { company_id: 1, company_name: 'Beta', branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, senior_plan_empid: null, employee_name: 'Emp1', user_level: 1, user_level_name: 'Admin', permission_list: '', workplace_id: 20 },
  ];
  const restore = mockPoolSequential([
    [[{ id: 1, empid: 1, password: 'hashed', employee_empid: '1' }]],
    [sessions],
    [[]],
    [[]],
  ]);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw' } }, res, () => {});
  restore();
  restorePos();
  assert.equal(res.code, 200);
  assert.equal(res.body.needsCompany, true);
  assert.equal(res.body.sessions.length, 2);
  assert.deepEqual(
    res.body.sessions.map((c) => c.company_name),
    ['Alpha', 'Beta'],
  );
});

test('login succeeds when companyId is 0', async () => {
  const restorePos = mockPosSessionLogger();
  const sessions = [
    { company_id: 0, company_name: 'Alpha', branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, senior_plan_empid: null, employee_name: 'Emp0', user_level: 1, user_level_name: 'Admin', permission_list: '', workplace_id: 7 },
    { company_id: 1, company_name: 'Beta', branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, senior_plan_empid: null, employee_name: 'Emp1', user_level: 1, user_level_name: 'Admin', permission_list: '', workplace_id: 30 },
  ];
  const restore = mockPoolSequential([
    [[{ id: 1, empid: 1, password: 'hashed', employee_empid: '1' }]],
    [sessions],
    [[]],
    [[]],
  ]);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw', companyId: 0 } }, res, () => {});
  restore();
  restorePos();
  assert.equal(res.code, 200);
  assert.equal(res.body.company, 0);
  assert.equal(res.body.session.company_id, 0);
  assert.equal(res.body.senior_plan_empid, null);
  assert.equal(res.body.session.senior_plan_empid, null);
});

test('login succeeds without workplace assignments', async () => {
  const restorePos = mockPosSessionLogger();
  const sessions = [
    { company_id: 2, company_name: 'Gamma', branch_id: 1, department_id: 1, position_id: 1, position: 'P', senior_empid: null, senior_plan_empid: null, employee_name: 'Emp2', user_level: 1, user_level_name: 'Admin', permission_list: '', workplace_id: null },
  ];
  const restore = mockPoolSequential([
    [[{ id: 1, empid: 1, password: 'hashed', employee_empid: '1' }]],
    [sessions],
    [[]],
    [[]],
  ]);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw' } }, res, () => {});
  restore();
  restorePos();
  assert.equal(res.code, 200);
  assert.equal(res.body.company, 2);
  assert.equal(res.body.workplace, null);
  assert.equal(res.body.session.workplace_id, null);
  assert.deepEqual(res.body.session.workplace_assignments, []);
});



test('login rejects employee without active employment assignments', async () => {
  const restorePos = mockPosSessionLogger();
  const restore = mockPoolSequential([
    [[{ id: 1, empid: 1, password: 'hashed', employee_empid: '1', emp_hiredate: '2022-05-03', emp_outdate: null }]],
    [[]],
  ]);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw' } }, res, () => {});
  restore();
  restorePos();
  assert.equal(res.code, 403);
  assert.equal(
    res.body.message,
    'Employee has no active employment assignment for the current date',
  );
});

test('login rejects employee outside active date window', async () => {
  const restorePos = mockPosSessionLogger();
  const restore = mockPoolSequential([
    [[{ id: 1, empid: 1, password: 'hashed', employee_empid: '1', emp_hiredate: '2022-05-03', emp_outdate: '2000-01-01' }]],
  ]);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw' } }, res, () => {});
  restore();
  restorePos();
  assert.equal(res.code, 403);
  assert.equal(res.body.message, 'Employee is not active for the current date');
});


test('login rejects user that is not registered in tbl_employee', async () => {
  const restorePos = mockPosSessionLogger();
  const restore = mockPoolSequential([
    [[{ id: 1, empid: 1, password: 'hashed', employee_empid: null }]],
  ]);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw' } }, res, () => {});
  restore();
  restorePos();
  assert.equal(res.code, 403);
  assert.equal(res.body.message, 'User is not registered as an employee');
});

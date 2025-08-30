import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyHandler } from '../../api-server/controllers/companyController.js';
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
    code: undefined,
    body: undefined,
    locals: {},
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
    },
    sendStatus(c) {
      this.code = c;
    },
  };
}

// A user may hold multiple employment sessions. Ensure that having the
// `system_settings` permission on any session allows company creation.
test('allows POST /api/companies when any session has system_settings', async () => {
  const restore = mockPoolSequential([
    [[
      {
        company_id: 1,
        company_name: 'Comp1',
        branch_id: 1,
        branch_name: 'Br',
        department_id: 1,
        department_name: 'Dept',
        position_id: 1,
        senior_empid: null,
        employee_name: 'Emp',
        user_level: 1,
        user_level_name: 'Admin',
        permission_list: '',
      },
      {
        company_id: 2,
        company_name: 'Comp2',
        branch_id: 1,
        branch_name: 'Br',
        department_id: 1,
        department_name: 'Dept',
        position_id: 1,
        senior_empid: null,
        employee_name: 'Emp',
        user_level: 1,
        user_level_name: 'Admin',
        permission_list: 'system_settings',
      },
    ]],
    [[{ COLUMN_NAME: 'name' }, { COLUMN_NAME: 'created_by' }]],
    [{ insertId: 1 }],
    [{ affectedRows: 1 }],
  ]);
  const req = {
    body: { name: 'NewCo', seedTables: [] },
    user: { empid: 1, companyId: 1 },
    session: { permissions: { system_settings: false } },
  };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  restore();
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { id: 1 });
});

// If none of the user's sessions include `system_settings`, creation is denied.
test('returns 403 for POST /api/companies when no session has system_settings', async () => {
  const restore = mockPoolSequential([
    [[
      {
        company_id: 1,
        company_name: 'Comp1',
        branch_id: 1,
        branch_name: 'Br',
        department_id: 1,
        department_name: 'Dept',
        position_id: 1,
        senior_empid: null,
        employee_name: 'Emp',
        user_level: 1,
        user_level_name: 'Admin',
        permission_list: '',
      },
    ]],
  ]);
  const req = {
    body: { name: 'NewCo', seedTables: [] },
    user: { empid: 1, companyId: 1 },
    session: { permissions: { system_settings: false } },
  };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  restore();
  assert.equal(res.code, 403);
});

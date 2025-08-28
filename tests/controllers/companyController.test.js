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
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; },
    sendStatus(c) { this.code = c; },
  };
}

test('createCompanyHandler allows system admin with companyId=0', async () => {
  let capturedCompanyId;
  const restore = mockPoolSequential([
    (sql, params) => {
      capturedCompanyId = params[1];
      return [[{
        company_id: 0,
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
    },
    [[{ COLUMN_NAME: 'name' }]],
    [{ insertId: 5 }],
    [[]],
  ]);
  const req = { body: { name: 'NewCo' }, user: { empid: 1, companyId: 0 } };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  restore();
  assert.equal(capturedCompanyId, 0);
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { id: 5 });
});

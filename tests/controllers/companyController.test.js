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
    [[
      { COLUMN_NAME: 'name' },
      { COLUMN_NAME: 'Gov_Registration_number' },
      { COLUMN_NAME: 'Address' },
      { COLUMN_NAME: 'Telephone' },
      { COLUMN_NAME: 'created_by' }
    ]],
    [{ insertId: 5 }],
    [[]],
    [[]],
  ]);
  const req = {
    body: {
      name: 'NewCo',
      Gov_Registration_number: '123',
      Address: 'Addr',
      Telephone: '555'
    },
    user: { empid: 1, companyId: 0 }
  };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  restore();
  assert.equal(capturedCompanyId, 0);
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { id: 5 });
});

test('createCompanyHandler forwards seedRecords and overwrite', async () => {
  const orig = db.pool.query;
  const inserts = [];
  let deleteCalled = false;
  db.pool.query = async (sql, params) => {
    if (/information_schema\.COLUMNS/.test(sql) && params[0] === 'companies') {
      return [[
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'Gov_Registration_number' },
        { COLUMN_NAME: 'Address' },
        { COLUMN_NAME: 'Telephone' },
        { COLUMN_NAME: 'created_by' }
      ]];
    }
    if (sql.startsWith('INSERT INTO ??') && params[0] === 'companies') {
      return [{ insertId: 9 }];
    }
    if (/FROM tenant_tables/.test(sql)) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)') && params[0] === 'posts') {
      return [[{ cnt: 2 }]];
    }
    if (/information_schema\.COLUMNS/.test(sql) && params[0] === 'posts') {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    if (/table_column_labels/.test(sql)) {
      return [[]];
    }
    if (sql.startsWith('DELETE FROM ??') && params[0] === 'posts') {
      deleteCalled = true;
      return [{}];
    }
    if (sql.startsWith('INSERT INTO ??') && params[0] === 'posts') {
      inserts.push(params);
      return [{}];
    }
    if (/INSERT INTO user_level_permissions/.test(sql)) {
      return [[]];
    }
    return [[]];
  };
  const req = {
    body: {
      name: 'SeedCo',
      Gov_Registration_number: '123',
      Address: 'Addr',
      Telephone: '555',
      seedTables: ['posts'],
      seedRecords: { posts: [{ id: 1 }, { id: 2 }] },
      overwrite: true,
    },
    user: { empid: 1, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  db.pool.query = orig;
  assert.equal(deleteCalled, true);
  assert.deepEqual(inserts, [
    ['posts', 9, 1],
    ['posts', 9, 2],
  ]);
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { id: 9 });
});

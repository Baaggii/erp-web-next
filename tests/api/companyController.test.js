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

// Allow company creation when the user's level grants `system_settings`.
test('allows POST /api/companies when user level has system_settings', async () => {
  let insertArgs;
  let assignArgs;
  const restore = mockPoolSequential([
    [[{ action: 'permission', action_key: 'system_settings' }]],
    [[
      { COLUMN_NAME: 'name' },
      { COLUMN_NAME: 'Gov_Registration_number' },
      { COLUMN_NAME: 'Address' },
      { COLUMN_NAME: 'Telephone' },
      { COLUMN_NAME: 'created_by' }
    ]],
    (sql, params) => {
      insertArgs = [sql, params];
      return [{ insertId: 1 }];
    },
    (sql, params) => {
      assignArgs = [sql, params];
      return [{ affectedRows: 1 }];
    },
  ]);
  const req = {
    body: {
      name: 'NewCo',
      Gov_Registration_number: '123',
      Address: 'Addr',
      Telephone: '555',
      seedTables: []
    },
    user: { empid: 1, companyId: 1, userLevel: 2 },
    session: { permissions: { system_settings: false } },
  };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  restore();
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { id: 1 });
  assert.ok(insertArgs[0].includes('`created_by`'));
  assert.ok(insertArgs[0].includes('`Gov_Registration_number`'));
  assert.ok(insertArgs[0].includes('`Address`'));
  assert.ok(insertArgs[0].includes('`Telephone`'));
  assert.deepEqual(insertArgs[1], ['companies', 'NewCo', '123', 'Addr', '555', 1]);
  assert.ok(assignArgs[0].startsWith('INSERT INTO user_companies'));
  assert.deepEqual(assignArgs[1], [1, 1, null, null, 1]);
});

// Deny creation when the user's level lacks `system_settings`.
test('returns 403 for POST /api/companies when user level lacks system_settings', async () => {
  const restore = mockPoolSequential([[[]]]);
  const req = {
    body: {
      name: 'NewCo',
      Gov_Registration_number: '123',
      Address: 'Addr',
      Telephone: '555',
      seedTables: []
    },
    user: { empid: 1, companyId: 1, userLevel: 2 },
    session: { permissions: { system_settings: false } },
  };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  restore();
  assert.equal(res.code, 403);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyHandler, deleteCompanyHandler } from '../../api-server/controllers/companyController.js';
import { seedCompany } from '../../api-server/controllers/tenantTablesController.js';
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

function mockPool(handler) {
  const originalQuery = db.pool.query;
  const originalGet = db.pool.getConnection;
  db.pool.query = handler;
  db.pool.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: handler,
  });
  return () => {
    db.pool.query = originalQuery;
    db.pool.getConnection = originalGet;
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

test('deleteCompanyHandler deletes company with cascade', async () => {
  const calls = [];
  const restore = mockPool(async (sql, params) => {
    calls.push({ sql, params });
    if (
      sql.includes('information_schema.STATISTICS') &&
      sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      return [[{ TABLE_NAME: 'orders', COLUMN_NAME: 'company_id', REFERENCED_COLUMN_NAME: 'id' }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'company_id' }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ count: 1 }]];
    }
    if (sql.startsWith('SELECT `id` FROM')) {
      return [[{ id: 3 }]];
    }
    if (sql.startsWith('DELETE FROM')) {
      return [{}];
    }
    throw new Error('unexpected query');
  });
  const req = {
    params: { id: '5' },
    user: { empid: 1, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  await deleteCompanyHandler(req, res, () => {});
  restore();
  const deletes = calls.filter(c => c.sql.startsWith('DELETE FROM'));
  assert.equal(deletes.length, 2);
  assert.equal(res.code, 204);
});

test('deleteCompanyHandler forwards error messages', async () => {
  const restore = mockPool(async () => {
    throw new Error('boom');
  });
  const req = {
    params: { id: '5' },
    user: { empid: 1, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  await deleteCompanyHandler(req, res, () => {});
  restore();
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { message: 'boom' });
});

test(
  'creating a company keeps tenant tables empty until seed endpoint runs',
  async (t) => {
    const companies = [];
    const posts = [];
    let tenantTableSelects = 0;
    const queryMock = t.mock.method(db.pool, 'query', async (sql, params) => {
      if (
        typeof sql === 'string' &&
        /information_schema\.COLUMNS/.test(sql) &&
        sql.startsWith('SELECT COLUMN_NAME')
      ) {
        if (params?.[0] === 'companies') {
          return [[
            { COLUMN_NAME: 'name' },
            { COLUMN_NAME: 'created_by' },
          ]];
        }
        if (params?.[0] === 'posts') {
          return [[
            { COLUMN_NAME: 'id' },
            { COLUMN_NAME: 'company_id' },
            { COLUMN_NAME: 'title' },
          ]];
        }
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('INSERT INTO ??') &&
        params?.[0] === 'companies'
      ) {
        const id = companies.length + 1;
        const open = sql.indexOf('(');
        const close = sql.indexOf(')', open + 1);
        const columnSegment = sql.slice(open + 1, close);
        const columns = columnSegment
          .split(',')
          .map((c) => c.trim().replace(/`/g, ''));
        const values = params.slice(1);
        const record = { id };
        columns.forEach((col, idx) => {
          record[col] = values[idx];
        });
        companies.push(record);
        return [{ insertId: id }];
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('INSERT INTO ??') &&
        params?.[0] === 'posts'
      ) {
        const open = sql.indexOf('(');
        const close = sql.indexOf(')', open + 1);
        const columnSegment = sql.slice(open + 1, close);
        const columns = columnSegment
          .split(',')
          .map((c) => c.trim().replace(/`/g, ''));
        const values = params.slice(1);
        const record = {};
        columns.forEach((col, idx) => {
          record[col] = values[idx];
        });
        posts.push(record);
        return [{}];
      }
      if (typeof sql === 'string' && sql === 'SELECT * FROM companies') {
        return [companies.map((c) => ({ ...c }))];
      }
      if (
        typeof sql === 'string' &&
        sql === 'SELECT * FROM companies WHERE created_by = ?'
      ) {
        const creator = params?.[0];
        return [
          companies
            .filter((c) => c.created_by === creator)
            .map((c) => ({ ...c })),
        ];
      }
      if (
        typeof sql === 'string' &&
        sql.includes('FROM tbl_employment e') &&
        sql.includes('GROUP BY e.employment_company_id')
      ) {
        const [, companyId] = params || [];
        return [[
          {
            company_id: companyId ?? 0,
            branch_id: 0,
            department_id: 0,
            position_id: 0,
            senior_empid: null,
            employee_name: 'Admin',
            user_level: 1,
            user_level_name: 'Admin',
            permission_list: 'system_settings',
          },
        ]];
      }
      if (
        typeof sql === 'string' &&
        sql.includes('FROM tenant_tables WHERE seed_on_create = 1')
      ) {
        tenantTableSelects += 1;
        const rows = [
          { table_name: 'posts', is_shared: 0 },
        ];
        return [rows];
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?')
      ) {
        const [tableName, companyId] = params || [];
        if (tableName === 'posts') {
          const count = posts.filter(
            (p) => Number(p.company_id) === Number(companyId),
          ).length;
          return [[{ cnt: count }]];
        }
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('SELECT COLUMN_NAME, COLUMN_KEY, EXTRA') &&
        sql.includes('information_schema.COLUMNS')
      ) {
        if (params?.[0] === 'posts') {
          return [[
            { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
            { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
            { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' },
          ]];
        }
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith(
          'SELECT column_name, mn_label FROM table_column_labels WHERE table_name = ?',
        )
      ) {
        return [[]];
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith(
          'INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key, created_by, created_at)',
        )
      ) {
        return [[]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const req = {
      body: { name: 'Seedless Co' },
      user: { empid: 42, companyId: 0, userLevel: 1 },
      session: { permissions: { system_settings: true } },
    };
    const res = createRes();
    await createCompanyHandler(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.code, 201);
    assert.equal(tenantTableSelects, 0);
    assert.deepEqual(posts, []);
    const companyId = res.body.id;

    const seedReq = {
      body: {
        companyId,
        tables: ['posts'],
        records: [
          {
            table: 'posts',
            rows: [{ id: 7, title: 'Welcome' }],
          },
        ],
        overwrite: false,
      },
      user: { empid: 42, companyId: 0 },
    };
    const seedRes = createRes();
    await seedCompany(seedReq, seedRes, (err) => {
      if (err) throw err;
    });
    assert.ok(tenantTableSelects > 0);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0], {
      company_id: companyId,
      id: 7,
      title: 'Welcome',
    });
    assert.equal(seedRes.body?.posts?.count, 1);
    assert.ok(queryMock.mock.calls.length > 0);
  },
);

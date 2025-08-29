import test from 'node:test';
import assert from 'node:assert/strict';
import * as controller from '../../api-server/controllers/tableController.js';
import * as db from '../../db/index.js';

function mockPool(handler) {
  const original = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = original;
  };
}

test('getTableRows forwards error for invalid column', async () => {
  const restore = mockPool(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id' }]];
    }
    throw new Error('unexpected query');
  });
  const req = {
    params: { table: 'badtable' },
    query: { bad: 'x' },
    user: { companyId: 1 },
  };
  let err;
  await controller.getTableRows(req, {}, (e) => { err = e; });
  restore();
  assert.ok(err);
  assert.match(err.message, /Invalid column name/);
});

test('getTableRows uses provided company_id param', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('tenant_tables')) {
      return [[{ is_shared: 1, seed_on_create: 0 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'company_id' }]];
    }
    if (sql.includes('COUNT(*)')) {
      assert.deepEqual(params, ['shared', 5]);
      return [[{ count: 1 }]];
    }
    return [[{ id: 1 }]];
  });
  const req = {
    params: { table: 'shared' },
    query: { company_id: 5 },
    user: { companyId: 7 },
  };
  const res = { json() {} };
  await controller.getTableRows(req, res, (e) => { if (e) throw e; });
  restore();
});

test('getTableRows falls back to user companyId when missing', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('tenant_tables')) {
      return [[{ is_shared: 1, seed_on_create: 0 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'company_id' }]];
    }
    if (sql.includes('COUNT(*)')) {
      assert.deepEqual(params, ['shared', 7]);
      return [[{ count: 1 }]];
    }
    return [[{ id: 1 }]];
  });
  const req = {
    params: { table: 'shared' },
    query: {},
    user: { companyId: 7 },
  };
  const res = { json() {} };
  await controller.getTableRows(req, res, (e) => { if (e) throw e; });
  restore();
});

test('addRow forwards db error when required id missing', async () => {
  const restore = mockPool(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'created_by' },
        { COLUMN_NAME: 'created_at' },
      ]];
    }
    if (sql.startsWith('INSERT INTO')) {
      throw new Error("ER_BAD_NULL_ERROR: Column 'id' cannot be null");
    }
    return [{}];
  });
  const req = {
    params: { table: 'test' },
    body: { name: 'Alice' },
    user: { empid: 'E1' },
  };
  let err;
  await controller.addRow(req, {}, (e) => { err = e; });
  restore();
  assert.ok(err);
  assert.match(err.message, /ER_BAD_NULL_ERROR/);
});

test('addRow defaults g_burtgel_id from g_id when missing', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'g_id' },
        { COLUMN_NAME: 'g_burtgel_id' },
      ]];
    }
    if (sql.startsWith('INSERT INTO')) {
      assert.ok(sql.includes('`g_id`') && sql.includes('`g_burtgel_id`'));
      assert.deepEqual(params, ['SGereeJ', 7, 7]);
      return [{ insertId: 1 }];
    }
    return [{}];
  });
  const req = { params: { table: 'SGereeJ' }, body: { g_id: 7 } };
  const res = { locals: {}, status() { return this; }, json() {} };
  await controller.addRow(req, res, (e) => { if (e) throw e; });
  restore();
});

test('addRow scopes company_id to user and overrides body value', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'company_id' },
      ]];
    }
    if (sql.startsWith('INSERT INTO')) {
      assert.ok(sql.includes('`name`') && sql.includes('`company_id`'));
      assert.deepEqual(params, ['test', 'Alice', 7]);
      return [{ insertId: 1 }];
    }
    return [{}];
  });
  const req = {
    params: { table: 'test' },
    body: { name: 'Alice', company_id: 5 },
    user: { companyId: 7 },
  };
  const res = { locals: {}, status() { return this; }, json() {} };
  await controller.addRow(req, res, (e) => { if (e) throw e; });
  restore();
});

test('addRow sets company_id from user when missing in body', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'company_id' },
      ]];
    }
    if (sql.startsWith('INSERT INTO')) {
      assert.ok(sql.includes('`company_id`'));
      assert.deepEqual(params, ['test', 7]);
      return [{ insertId: 1 }];
    }
    return [{}];
  });
  const req = {
    params: { table: 'test' },
    body: {},
    user: { companyId: 7 },
  };
  const res = { locals: {}, status() { return this; }, json() {} };
  await controller.addRow(req, res, (e) => { if (e) throw e; });
  restore();
});

test('addRow populates created_by and created_at when absent', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'created_by' },
        { COLUMN_NAME: 'created_at' },
      ]];
    }
    if (sql.startsWith('INSERT INTO')) {
      assert.ok(sql.includes('`created_by`') && sql.includes('`created_at`'));
      assert.strictEqual(params[0], 'test');
      assert.strictEqual(params[1], 'Alice');
      assert.strictEqual(params[2], 'E1');
      assert.match(params[3], /\d{4}-\d{2}-\d{2}/);
      return [{ insertId: 1 }];
    }
    return [{}];
  });
  const req = {
    params: { table: 'test' },
    body: { name: 'Alice' },
    user: { empid: 'E1', companyId: 1 },
  };
  const res = { locals: {}, status() { return this; }, json() {} };
  await controller.addRow(req, res, (e) => { if (e) throw e; });
  restore();
});

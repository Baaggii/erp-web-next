import test from 'node:test';
import assert from 'node:assert/strict';
import * as controller from '../../api-server/controllers/tableController.js';
import * as db from '../../db/index.js';
import { EventEmitter } from 'node:events';

function mockPool(handler) {
  const originalQuery = db.pool.query;
  const originalGetConn = db.pool.getConnection;
  db.pool.query = handler;
  db.pool.getConnection = async () => ({
    query: handler,
    release() {},
    destroy() {},
  });
  return () => {
    db.pool.query = originalQuery;
    db.pool.getConnection = originalGetConn;
  };
}

function mockGetConnection(handler) {
  const original = db.pool.getConnection;
  db.pool.getConnection = handler;
  return () => {
    db.pool.getConnection = original;
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
    on() {},
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
    on() {},
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
    on() {},
  };
  const res = { json() {} };
  await controller.getTableRows(req, res, (e) => { if (e) throw e; });
  restore();
});

test('getTableRows aborts request and destroys connection', async () => {
  const restoreQuery = mockPool(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id' }]];
    }
    throw new Error('unexpected query');
  });
  let destroyed = false;
  let released = false;
  let queryCount = 0;
  const conn = {
    query() {
      queryCount++;
      return new Promise((resolve, reject) => {
        this._reject = reject;
      });
    },
    release() {
      released = true;
    },
    destroy() {
      destroyed = true;
      this._reject?.(new Error('aborted'));
    },
  };
  let resolveConn;
  const restoreConn = mockGetConnection(
    () =>
      new Promise((resolve) => {
        resolveConn = () => resolve(conn);
      }),
  );
  const req = new EventEmitter();
  req.params = { table: 't' };
  req.query = {};
  req.user = {};
  const res = { json() {} };
  let err;
  const p = controller.getTableRows(req, res, (e) => {
    err = e;
  });
  while (typeof resolveConn !== 'function') {
    // wait for getConnection to be requested
    await new Promise((r) => setImmediate(r));
  }
  resolveConn();
  await new Promise((r) => setImmediate(r));
  req.emit('close');
  await p;
  restoreConn();
  restoreQuery();
  assert.ok(err);
  assert.equal(err.name, 'AbortError');
  assert.ok(destroyed);
  assert.strictEqual(released, false);
  assert.strictEqual(queryCount, 1);
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

test('updateRow populates updated_by and updated_at when absent', async () => {
  const restore = mockPool(async (sql, params) => {
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.startsWith('SELECT * FROM `test`')) {
      return [[{ id: 1 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'updated_by' },
        { COLUMN_NAME: 'updated_at' },
      ]];
    }
    if (sql.startsWith('UPDATE')) {
      assert.ok(sql.includes('`updated_by` = ?'));
      assert.ok(sql.includes('`updated_at` = ?'));
      assert.strictEqual(params[0], 'test');
      assert.strictEqual(params[1], 'Alice');
      assert.strictEqual(params[2], 'E1');
      assert.match(params[3], /\d{4}-\d{2}-\d{2}/);
      assert.strictEqual(params[4], '1');
      return [{}];
    }
    throw new Error('unexpected query ' + sql);
  });
  const req = {
    params: { table: 'test', id: '1' },
    body: { name: 'Alice' },
    user: { empid: 'E1' },
  };
  const res = { locals: {}, sendStatus(c) { this.code = c; } };
  await controller.updateRow(req, res, (e) => { if (e) throw e; });
  restore();
  assert.equal(res.code, 204);
});

test('updateRow forwards user companyId to updateTableRow', async () => {
  const restore = mockPool(async (sql, params) => {
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'company_id' },
      ]];
    }
    if (sql.startsWith('SELECT * FROM `tenant_up`')) {
      return [[{ id: 1, company_id: 9 }]];
    }
    if (sql.startsWith('UPDATE')) {
      if (params[0] === 'tenant_up') {
        assert.ok(sql.includes('`company_id` = ?'));
        assert.deepEqual(params, ['tenant_up', 'Bob', '1', 9]);
      }
      return [{}];
    }
    return [[]];
  });
  const req = {
    params: { table: 'tenant_up', id: '1' },
    body: { name: 'Bob' },
    user: { companyId: 9 },
  };
  const res = { locals: {}, sendStatus(c) { this.code = c; } };
  await controller.updateRow(req, res, (e) => { if (e) throw e; });
  restore();
  assert.equal(res.code, 204);
});

test('deleteRow forwards user companyId to deleteTableRow', async () => {
  const restore = mockPool(async (sql, params) => {
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'company_id' }]];
    }
    if (sql.startsWith('SELECT * FROM `tenant_del`')) {
      return [[{ id: '5', company_id: 4 }]];
    }
    if (sql.startsWith('DELETE')) {
      if (params[0] === 'tenant_del') {
        assert.ok(sql.includes('`company_id` = ?'));
        assert.deepEqual(params, ['tenant_del', '5', 4]);
      }
      return [{}];
    }
    return [[]];
  });
  const req = {
    params: { table: 'tenant_del', id: '5' },
    query: {},
    user: { companyId: 4, empid: 'E1' },
  };
  const res = { locals: {}, sendStatus(c) { this.code = c; } };
  await controller.deleteRow(req, res, (e) => { if (e) throw e; });
  restore();
  assert.equal(res.code, 204);
});

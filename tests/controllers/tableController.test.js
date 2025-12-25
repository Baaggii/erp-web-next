import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as controller from '../../api-server/controllers/tableController.js';
import * as db from '../../db/index.js';
import * as relationsConfig from '../../api-server/services/tableRelationsConfig.js';
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

test('getTableColumnsMeta returns metadata with primary key ordinals', async () => {
  const restore = mockPool(async (sql, params) => {
    const text = typeof sql === 'string' ? sql : sql?.sql || '';
    if (text.includes('information_schema.COLUMNS')) {
      assert.deepEqual(params, ['tenants']);
      return [[
        {
          COLUMN_NAME: 'tenant_id',
          COLUMN_KEY: 'PRI',
          EXTRA: '',
          GENERATION_EXPRESSION: null,
          PRIMARY_KEY_ORDINAL: '2',
        },
        {
          COLUMN_NAME: 'code',
          COLUMN_KEY: 'PRI',
          EXTRA: '',
          GENERATION_EXPRESSION: null,
          PRIMARY_KEY_ORDINAL: 1,
        },
        {
          COLUMN_NAME: 'description',
          COLUMN_KEY: '',
          EXTRA: '',
          GENERATION_EXPRESSION: null,
          PRIMARY_KEY_ORDINAL: null,
        },
      ]];
    }
    if (text.includes("INDEX_NAME = 'PRIMARY'")) {
      return [[
        { COLUMN_NAME: 'code', SEQ_IN_INDEX: 1 },
        { COLUMN_NAME: 'tenant_id', SEQ_IN_INDEX: 2 },
      ]];
    }
    if (text.includes('table_column_labels')) {
      return [[]];
    }
    return [[]];
  });
  const req = { params: { table: 'tenants' } };
  const res = {
    json(payload) {
      this.payload = payload;
    },
  };
  try {
    await controller.getTableColumnsMeta(req, res, (err) => {
      if (err) throw err;
    });
  } finally {
    restore();
  }
  assert.deepEqual(res.payload, [
    {
      name: 'tenant_id',
      key: 'PRI',
      extra: '',
      label: 'tenant_id',
      generationExpression: null,
      primaryKeyOrdinal: 2,
      candidateKeyOrdinal: 2,
      enumValues: [],
      dataType: null,
      columnType: null,
      isNullable: null,
      isJson: false,
    },
    {
      name: 'code',
      key: 'PRI',
      extra: '',
      label: 'code',
      generationExpression: null,
      primaryKeyOrdinal: 1,
      candidateKeyOrdinal: 1,
      enumValues: [],
      dataType: null,
      columnType: null,
      isNullable: null,
      isJson: false,
    },
    {
      name: 'description',
      key: '',
      extra: '',
      label: 'Тайлбар',
      generationExpression: null,
      primaryKeyOrdinal: null,
      candidateKeyOrdinal: null,
      enumValues: [],
      dataType: null,
      columnType: null,
      isNullable: null,
      isJson: false,
    },
  ]);
});

test('getTableRow returns row data with tenant filters', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'branch_id' },
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'is_deleted' },
      ]];
    }
    if (sql.includes("INDEX_NAME = 'PRIMARY'")) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('tenant_tables')) {
      return [[{ is_shared: 0, seed_on_create: 0 }]];
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE')) {
      assert.deepEqual(params, [
        'users_edit',
        '5',
        '3',
        '7',
      ]);
      return [[{ id: 5, company_id: 3, branch_id: 7, name: 'Example' }]];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const req = {
    params: { table: 'users_edit', id: '5' },
    query: { company_id: '3', branch_id: '7' },
    user: { companyId: 9 },
  };
  const res = {
    json(payload) {
      this.payload = payload;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
  try {
    await controller.getTableRow(req, res, (err) => {
      if (err) throw err;
    });
  } finally {
    restore();
  }
  assert.deepEqual(res.payload, {
    id: 5,
    company_id: 3,
    branch_id: 7,
    name: 'Example',
  });
  assert.equal(res.statusCode, undefined);
});

test('getTableRow handles camel-cased tenant keys when fetching row data', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'Id' },
        { COLUMN_NAME: 'CompanyID' },
        { COLUMN_NAME: 'Name' },
      ]];
    }
    if (sql.includes("INDEX_NAME = 'PRIMARY'")) {
      return [[{ COLUMN_NAME: 'Id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('tenant_tables')) {
      return [[{ is_shared: 0, seed_on_create: 0 }]];
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE')) {
      assert.deepEqual(params, ['users_edit', '42', '7']);
      return [[{ Id: 42, CompanyID: 7, Name: 'Example Camel' }]];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const req = {
    params: { table: 'users_edit', id: '42' },
    query: { company_id: '7' },
    user: { companyId: 3 },
  };
  const res = {
    json(payload) {
      this.payload = payload;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
  try {
    await controller.getTableRow(req, res, (err) => {
      if (err) throw err;
    });
  } finally {
    restore();
  }
  assert.deepEqual(res.payload, { Id: 42, CompanyID: 7, Name: 'Example Camel' });
  assert.equal(res.statusCode, undefined);
});

test('getTableRow supports JSON-encoded composite ids', async () => {
  const tableName = 'json_get_invoices';
  const idParts = ['10', 'INV-1', '2023-05-10'];
  let selectParams;
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'invoice_no' },
        { COLUMN_NAME: 'trans_date' },
        { COLUMN_NAME: 'is_deleted' },
      ]];
    }
    if (sql.includes("INDEX_NAME = 'PRIMARY'")) {
      return [[
        { COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
        { COLUMN_NAME: 'invoice_no', SEQ_IN_INDEX: 2 },
        { COLUMN_NAME: 'trans_date', SEQ_IN_INDEX: 3 },
      ]];
    }
    if (sql.includes('tenant_tables')) {
      return [[{ is_shared: 0, seed_on_create: 0 }]];
    }
    if (typeof sql === 'string' && sql.startsWith('SELECT * FROM ?? WHERE')) {
      selectParams = params;
      return [[
        {
          company_id: 10,
          invoice_no: 'INV-1',
          trans_date: '2023-05-10',
        },
      ]];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const req = {
    params: { table: tableName, id: JSON.stringify(idParts) },
    query: {},
    user: { companyId: 99 },
  };
  const res = {
    json(payload) {
      this.payload = payload;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
  try {
    await controller.getTableRow(req, res, (err) => {
      if (err) throw err;
    });
  } finally {
    restore();
  }
  assert.deepEqual(selectParams, [tableName, ...idParts]);
  assert.deepEqual(res.payload, {
    company_id: 10,
    invoice_no: 'INV-1',
    trans_date: '2023-05-10',
  });
  assert.equal(res.statusCode, undefined);
});

test('getTableRow returns 404 when no row is found', async () => {
  const restore = mockPool(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'is_deleted' },
      ]];
    }
    if (sql.includes("INDEX_NAME = 'PRIMARY'")) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('tenant_tables')) {
      return [[{ is_shared: 0, seed_on_create: 0 }]];
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE')) {
      assert.deepEqual(params, ['users_missing', '99', 2]);
      return [[]];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const req = {
    params: { table: 'users_missing', id: '99' },
    query: {},
    user: { companyId: 2 },
  };
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
    },
  };
  try {
    await controller.getTableRow(req, res, (err) => {
      if (err) throw err;
    });
  } finally {
    restore();
  }
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, { message: 'Row not found' });
});

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

test('getTableRows applies soft delete filter by default', async () => {
  let selectSql = '';
  let countSql = '';
  const restore = mockPool(async (sql) => {
    if (sql.includes('tenant_tables')) {
      return [[]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'company_id' }, { COLUMN_NAME: 'is_deleted' }]];
    }
    if (sql.startsWith('SELECT *')) {
      selectSql = sql;
      return [[{ id: 1 }]];
    }
    if (sql.includes('COUNT(*)')) {
      countSql = sql;
      return [[{ count: 1 }]];
    }
    return [[{ id: 1 }]];
  });
  const req = {
    params: { table: 'soft_users' },
    query: {},
    user: { companyId: 3 },
    on() {},
  };
  const res = { json() {} };
  await controller.getTableRows(req, res, (e) => { if (e) throw e; });
  restore();
  assert.ok(selectSql.includes("(`is_deleted` IS NULL OR `is_deleted` IN (0,''))"));
  assert.ok(countSql.includes("(`is_deleted` IS NULL OR `is_deleted` IN (0,''))"));
});

test('getTableRows can include soft deleted rows when requested', async () => {
  let selectSql = '';
  let countSql = '';
  const restore = mockPool(async (sql) => {
    if (sql.includes('tenant_tables')) {
      return [[]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'company_id' }, { COLUMN_NAME: 'is_deleted' }]];
    }
    if (sql.startsWith('SELECT *')) {
      selectSql = sql;
      return [[{ id: 1 }]];
    }
    if (sql.includes('COUNT(*)')) {
      countSql = sql;
      return [[{ count: 1 }]];
    }
    return [[{ id: 1 }]];
  });
  const req = {
    params: { table: 'soft_users' },
    query: { includeDeleted: 'true' },
    user: { companyId: 3 },
    on() {},
  };
  const res = { json() {} };
  await controller.getTableRows(req, res, (e) => { if (e) throw e; });
  restore();
  assert.ok(!selectSql.includes("(`is_deleted` IS NULL OR `is_deleted` IN (0,''))"));
  assert.ok(!countSql.includes("(`is_deleted` IS NULL OR `is_deleted` IN (0,''))"));
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

test('updateRow supports JSON-encoded composite ids', async () => {
  const tableName = 'json_update_invoices';
  const idParts = ['10', 'INV-1', '2023-05-10'];
  let updateParams;
  const restore = mockPool(async (sql, params) => {
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[
        { COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
        { COLUMN_NAME: 'invoice_no', SEQ_IN_INDEX: 2 },
        { COLUMN_NAME: 'trans_date', SEQ_IN_INDEX: 3 },
      ]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'invoice_no' },
        { COLUMN_NAME: 'trans_date' },
        { COLUMN_NAME: 'amount' },
        { COLUMN_NAME: 'updated_at' },
      ]];
    }
    if (sql.startsWith(`SELECT * FROM \`${tableName}\``)) {
      return [[
        {
          company_id: 10,
          invoice_no: 'INV-1',
          trans_date: '2023-05-10',
        },
      ]];
    }
    if (sql.startsWith('UPDATE')) {
      if (params[0] === tableName) {
        updateParams = params;
      }
      return [{}];
    }
    return [[]];
  });
  const req = {
    params: { table: tableName, id: JSON.stringify(idParts) },
    body: { amount: 5 },
    user: { empid: 'E1', companyId: 10 },
  };
  const res = { locals: {}, sendStatus(code) { this.code = code; } };
  await controller.updateRow(req, res, (e) => { if (e) throw e; });
  restore();
  assert.equal(res.code, 204);
  assert.ok(updateParams, 'expected update query to run');
  assert.strictEqual(updateParams[0], tableName);
  assert.strictEqual(updateParams[1], 5);
  assert.match(updateParams[2], /\d{4}-\d{2}-\d{2}/);
  assert.deepEqual(updateParams.slice(-3), idParts);
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

test('deleteRow supports JSON-encoded composite ids', async () => {
  const tableName = 'json_delete_invoices';
  const idParts = ['10', 'INV-1', '2023-05-10'];
  let deleteParams;
  const restore = mockPool(async (sql, params) => {
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[
        { COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
        { COLUMN_NAME: 'invoice_no', SEQ_IN_INDEX: 2 },
        { COLUMN_NAME: 'trans_date', SEQ_IN_INDEX: 3 },
      ]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'invoice_no' },
        { COLUMN_NAME: 'trans_date' },
      ]];
    }
    if (sql.startsWith(`SELECT * FROM \`${tableName}\``)) {
      return [[
        {
          company_id: 10,
          invoice_no: 'INV-1',
          trans_date: '2023-05-10',
        },
      ]];
    }
    if (sql.startsWith('DELETE')) {
      if (params[0] === tableName) {
        deleteParams = params;
      }
      return [{}];
    }
    return [[]];
  });
  const req = {
    params: { table: tableName, id: JSON.stringify(idParts) },
    query: {},
    user: { companyId: 10, empid: 'E1' },
  };
  const res = { locals: {}, sendStatus(code) { this.code = code; } };
  await controller.deleteRow(req, res, (e) => { if (e) throw e; });
  restore();
  assert.equal(res.code, 204);
  assert.ok(deleteParams, 'expected delete query to run');
  assert.strictEqual(deleteParams[0], tableName);
  assert.deepEqual(deleteParams.slice(-3), idParts);
});
if (typeof mock?.import !== 'function') {
  test('getTableRelations merges database and custom entries', { skip: true }, () => {});
  test('listCustomTableRelations returns config and default flag', { skip: true }, () => {});
  test('saveCustomTableRelation persists mapping via service', { skip: true }, () => {});
  test('deleteCustomTableRelation calls remove service', { skip: true }, () => {});
} else {
  test('getTableRelations merges database and custom entries', async () => {
    const actualDb = await import('../../db/index.js');
    const actualService = await import(
      '../../api-server/services/tableRelationsConfig.js'
    );
    const { getTableRelations } = await mock.import(
      '../../api-server/controllers/tableController.js',
      {
        '../../db/index.js': {
          ...actualDb,
          listTableRelationships: async () => [
            {
              COLUMN_NAME: 'company_id',
              REFERENCED_TABLE_NAME: 'companies',
              REFERENCED_COLUMN_NAME: 'id',
            },
          ],
        },
        '../services/tableRelationsConfig.js': {
          ...actualService,
          listCustomRelations: async () => ({
            config: { dept_id: [{ table: 'departments', column: 'id' }] },
            isDefault: false,
          }),
        },
      },
    );
    const req = { params: { table: 'users' }, query: {}, user: { companyId: 5 } };
    let response;
    const res = {
      json(body) {
        response = body;
      },
    };
    await getTableRelations(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(response.length, 2);
    assert.deepEqual(response[0], {
      COLUMN_NAME: 'company_id',
      REFERENCED_TABLE_NAME: 'companies',
      REFERENCED_COLUMN_NAME: 'id',
      source: 'database',
    });
    assert.deepEqual(response[1], {
      COLUMN_NAME: 'dept_id',
      REFERENCED_TABLE_NAME: 'departments',
      REFERENCED_COLUMN_NAME: 'id',
      source: 'custom',
      configIndex: 0,
    });
  });

  test('listCustomTableRelations returns config and default flag', async () => {
    const actualService = await import(
      '../../api-server/services/tableRelationsConfig.js'
    );
    const { listCustomTableRelations } = await mock.import(
      '../../api-server/controllers/tableController.js',
      {
        '../services/tableRelationsConfig.js': {
          ...actualService,
          listCustomRelations: async () => ({
            config: { dept_id: [{ table: 'departments', column: 'id' }] },
            isDefault: true,
          }),
        },
      },
    );
    const req = { params: { table: 'users' }, query: {}, user: { companyId: 3 } };
    let payload;
    const res = {
      json(body) {
        payload = body;
      },
    };
    await listCustomTableRelations(req, res, (err) => {
      if (err) throw err;
    });
    assert.deepEqual(payload, {
      relations: { dept_id: [{ table: 'departments', column: 'id' }] },
      isDefault: true,
    });
  });

  test('saveCustomTableRelation persists mapping via service', async () => {
    const actualService = await import(
      '../../api-server/services/tableRelationsConfig.js'
    );
    let args;
    const { saveCustomTableRelation } = await mock.import(
      '../../api-server/controllers/tableController.js',
      {
        '../services/tableRelationsConfig.js': {
          ...actualService,
          saveCustomRelation: async (...callArgs) => {
            args = callArgs;
            return {
              relation: { table: 'departments', column: 'id' },
              index: 0,
              relations: [{ table: 'departments', column: 'id' }],
            };
          },
        },
      },
    );
    const req = {
      params: { table: 'users', column: 'dept_id' },
      body: { targetTable: 'departments', targetColumn: 'id' },
      query: {},
      user: { companyId: 9 },
    };
    let payload;
    const res = {
      json(body) {
        payload = body;
      },
      status() {
        return this;
      },
    };
    await saveCustomTableRelation(req, res, (err) => {
      if (err) throw err;
    });
    assert.deepEqual(args, [
      'users',
      'dept_id',
      { table: 'departments', column: 'id', idField: undefined, displayFields: undefined },
      9,
    ]);
    assert.deepEqual(payload, {
      column: 'dept_id',
      relation: { table: 'departments', column: 'id' },
      index: 0,
      relations: [{ table: 'departments', column: 'id' }],
      source: 'custom',
    });
  });

  test('saveCustomTableRelation updates mapping when index provided', async () => {
    const actualService = await import(
      '../../api-server/services/tableRelationsConfig.js'
    );
    let args;
    const { saveCustomTableRelation } = await mock.import(
      '../../api-server/controllers/tableController.js',
      {
        '../services/tableRelationsConfig.js': {
          ...actualService,
          updateCustomRelationAtIndex: async (...callArgs) => {
            args = callArgs;
            return {
              relation: { table: 'teams', column: 'lead_id' },
              index: 1,
              relations: [
                { table: 'departments', column: 'id' },
                { table: 'teams', column: 'lead_id' },
              ],
            };
          },
          saveCustomRelation: async () => {
            throw new Error('saveCustomRelation should not be called');
          },
        },
      },
    );
    const req = {
      params: { table: 'users', column: 'dept_id' },
      body: { targetTable: 'teams', targetColumn: 'lead_id', index: 1 },
      query: {},
      user: { companyId: 4 },
    };
    let payload;
    const res = {
      json(body) {
        payload = body;
      },
      status() {
        return this;
      },
    };
    await saveCustomTableRelation(req, res, (err) => {
      if (err) throw err;
    });
    assert.deepEqual(args, [
      'users',
      'dept_id',
      1,
      { table: 'teams', column: 'lead_id', idField: undefined, displayFields: undefined },
      4,
    ]);
    assert.deepEqual(payload, {
      column: 'dept_id',
      relation: { table: 'teams', column: 'lead_id' },
      index: 1,
      relations: [
        { table: 'departments', column: 'id' },
        { table: 'teams', column: 'lead_id' },
      ],
      source: 'custom',
    });
  });

  test('deleteCustomTableRelation calls remove service', async () => {
    const actualService = await import(
      '../../api-server/services/tableRelationsConfig.js'
    );
    let args;
    const { deleteCustomTableRelation } = await mock.import(
      '../../api-server/controllers/tableController.js',
      {
        '../services/tableRelationsConfig.js': {
          ...actualService,
          removeCustomRelation: async (...callArgs) => {
            args = callArgs;
            return { removed: [{ table: 'departments', column: 'id' }], index: -1, relations: [] };
          },
        },
      },
    );
    const req = {
      params: { table: 'users', column: 'dept_id' },
      query: {},
      user: { companyId: 2 },
    };
    let payload;
    const res = {
      status(code) {
        return this;
      },
      json(body) {
        payload = body;
      },
    };
    await deleteCustomTableRelation(req, res, (err) => {
      if (err) throw err;
    });
    assert.deepEqual(args, ['users', 'dept_id', 2]);
    assert.deepEqual(payload, {
      column: 'dept_id',
      removed: [{ table: 'departments', column: 'id' }],
      index: -1,
      relations: [],
    });
  });

  test('deleteCustomTableRelation removes mapping by index', async () => {
    const actualService = await import(
      '../../api-server/services/tableRelationsConfig.js'
    );
    let args;
    const { deleteCustomTableRelation } = await mock.import(
      '../../api-server/controllers/tableController.js',
      {
        '../services/tableRelationsConfig.js': {
          ...actualService,
          removeCustomRelationAtIndex: async (...callArgs) => {
            args = callArgs;
            return {
              removed: { table: 'departments', column: 'id' },
              index: 0,
              relations: [{ table: 'teams', column: 'lead_id' }],
            };
          },
          removeCustomRelation: async () => {
            throw new Error('removeCustomRelation should not be called');
          },
        },
      },
    );
    const req = {
      params: { table: 'users', column: 'dept_id' },
      query: { index: '0' },
      user: { companyId: 3 },
    };
    let payload;
    const res = {
      status() {
        return this;
      },
      json(body) {
        payload = body;
      },
    };
    await deleteCustomTableRelation(req, res, (err) => {
      if (err) throw err;
    });
    assert.deepEqual(args, ['users', 'dept_id', 0, 3]);
    assert.deepEqual(payload, {
      column: 'dept_id',
      removed: { table: 'departments', column: 'id' },
      index: 0,
      relations: [{ table: 'teams', column: 'lead_id' }],
    });
  });
}

test('saveCustomTableRelation validates required fields', async () => {
  const req = {
    params: { table: 'users', column: 'dept_id' },
    body: { targetTable: '', targetColumn: '' },
    query: {},
    user: { companyId: 1 },
  };
  let statusCode;
  let message;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      message = body;
    },
  };
  await controller.saveCustomTableRelation(req, res, (err) => {
    if (err) throw err;
  });
  assert.equal(statusCode, 400);
  assert.deepEqual(message, { message: 'targetTable is required' });
});

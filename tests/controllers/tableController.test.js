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
  const req = { params: { table: 'badtable' }, query: { bad: 'x' } };
  let err;
  await controller.getTableRows(req, {}, (e) => { err = e; });
  restore();
  assert.ok(err);
  assert.match(err.message, /Invalid column name/);
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

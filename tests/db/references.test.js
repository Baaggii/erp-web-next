import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

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

test('listRowReferences counts referencing rows', async () => {
  let step = 0;
  const restore = mockPool(async (sql, params) => {
    step++;
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      if (params[0] === 'users') {
        return [[{
          CONSTRAINT_NAME: 'fk_orders_users',
          TABLE_NAME: 'orders',
          COLUMN_NAME: 'user_id',
          REFERENCED_COLUMN_NAME: 'id',
        }]];
      }
      return [[]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      assert.equal(params[0], 'orders');
      assert.equal(params[1], 'user_id');
      assert.equal(params[2], '5');
      return [[{ count: 2 }]];
    }
    throw new Error('unexpected query');
  });
  const refs = await db.listRowReferences('users', '5');
  restore();
  assert.deepEqual(refs, [
    {
      table: 'orders',
      column: 'user_id',
      value: '5',
      columns: ['user_id'],
      values: ['5'],
      count: 2,
    },
  ]);
});

test('listRowReferences handles composite foreign keys', async () => {
  const restore = mockPool(async (sql, params) => {
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[
        { COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
        { COLUMN_NAME: 'id', SEQ_IN_INDEX: 2 },
      ]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      return [[
        {
          CONSTRAINT_NAME: 'fk_orders_users',
          TABLE_NAME: 'orders',
          COLUMN_NAME: 'company_id',
          REFERENCED_COLUMN_NAME: 'company_id',
        },
        {
          CONSTRAINT_NAME: 'fk_orders_users',
          TABLE_NAME: 'orders',
          COLUMN_NAME: 'user_id',
          REFERENCED_COLUMN_NAME: 'id',
        },
      ]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      assert.equal(params[0], 'orders');
      assert.equal(params[1], 'company_id');
      assert.equal(params[2], '5');
      assert.equal(params[3], 'user_id');
      assert.equal(params[4], '7');
      return [[{ count: 1 }]];
    }
    throw new Error('unexpected query');
  });
  const refs = await db.listRowReferences('users', '5-7');
  restore();
  assert.deepEqual(refs, [
    {
      table: 'orders',
      columns: ['company_id', 'user_id'],
      values: ['5', '7'],
      count: 1,
    },
  ]);
});

test('deleteTableRowCascade deletes related rows first', async () => {
  const calls = [];
  const restore = mockPool(async (sql, params) => {
    calls.push({ sql, params });
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      return [[{ TABLE_NAME: 'orders', COLUMN_NAME: 'user_id', REFERENCED_COLUMN_NAME: 'id' }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id' }]];
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
  await db.deleteTableRowCascade('users', '7');
  restore();
  const deletes = calls.filter(c => c.sql.startsWith('DELETE FROM'));
  assert.equal(deletes.length, 2);
  assert.ok(deletes[0].params.includes('orders'));
  assert.ok(deletes[1].params.includes('users'));
});

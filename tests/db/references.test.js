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
    if (sql.startsWith('SHOW KEYS')) {
      return [[{ Column_name: 'id' }]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      return [[{ TABLE_NAME: 'orders', COLUMN_NAME: 'user_id', REFERENCED_COLUMN_NAME: 'id' }]];
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
    { table: 'orders', column: 'user_id', value: '5', count: 2 },
  ]);
});

test('deleteTableRowCascade deletes related rows first', async () => {
  const calls = [];
  const restore = mockPool(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SHOW KEYS')) {
      return [[{ Column_name: 'id' }]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      return [[{ TABLE_NAME: 'orders', COLUMN_NAME: 'user_id', REFERENCED_COLUMN_NAME: 'id' }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ count: 1 }]];
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

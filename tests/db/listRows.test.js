import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPool() {
  const original = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'name' }]];
    }
    return [[{ id: 1, name: 'A' }]];
  };
  return () => {
    db.pool.query = original;
    return calls;
  };
}

test('listTableRows applies sorting and filters', async () => {
  const restore = mockPool();
  await db.listTableRows('users', {
    filters: { name: 'Bob' },
    sort: { column: 'id', dir: 'desc' },
    perPage: 10,
  });
  const calls = restore();
  const main = calls.find((c) => c.sql.startsWith('SELECT *'));
  assert.ok(main.sql.includes('ORDER BY `id` DESC'));
  assert.ok(main.sql.includes('%Bob%'));
});

test('listTableRows returns SQL when debug enabled', async () => {
  const restore = mockPool();
  const result = await db.listTableRows('users', {
    filters: { name: 'Alice' },
    debug: true,
  });
  restore();
  assert.ok(result.sql.includes('SELECT *'));
});

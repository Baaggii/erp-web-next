import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPool(flagsMap = {}) {
  const original = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('tenant_tables')) {
      const table = params?.[0];
      const flags = flagsMap[table];
      return [flags ? [flags] : []];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'name' },
      ]];
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
  assert.ok(main.sql.includes("'Bob'"));
  assert.ok(!main.sql.includes('%Bob%'));
  assert.ok(!main.sql.toLowerCase().includes('like'));
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

test('listTableRows allows search across multiple columns', async () => {
  const restore = mockPool();
  await db.listTableRows('users', {
    search: 'Bob',
    searchColumns: ['id', 'name'],
  });
  const calls = restore();
  const main = calls.find((c) => c.sql.startsWith('SELECT *'));
  assert.ok(main.sql.includes('OR'));
  assert.ok(main.sql.includes('id'));
  assert.ok(main.sql.includes('name'));
});

test('listTableRows scopes company_id with shared tables', async () => {
  const restore = mockPool({ shared: { is_shared: 1, seed_on_create: 0 } });
  await db.listTableRows('shared', {
    filters: { company_id: 5 },
  });
  const calls = restore();
  const count = calls.find((c) => c.sql.includes('COUNT(*)'));
  assert.ok(/`company_id`\s+IN\s*\(0,\s*\?\)/i.test(count.sql));
});

test('listTableRows skips company_id for global tables', async () => {
  const restore = mockPool({});
  await db.listTableRows('global', {
    filters: { company_id: 7 },
  });
  const calls = restore();
  const count = calls.find((c) => c.sql.includes('COUNT(*)'));
  assert.ok(!/company_id/i.test(count.sql));
});

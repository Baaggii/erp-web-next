import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPool(
  flagsMap = {},
  rows = [{ id: 1, name: 'Bob Smith' }],
  columns = ['company_id', 'id', 'name'],
) {
  const originalQuery = db.pool.query;
  const originalGetConn = db.pool.getConnection;
  const calls = [];
  db.pool.query = async (sql, params) => {
    // Queries for metadata (columns, tenant tables)
    if (sql.includes('tenant_tables')) {
      const table = params?.[0];
      const flags = flagsMap[table];
      return [flags ? [flags] : []];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [columns.map((name) => ({ COLUMN_NAME: name }))];
    }
    return [rows];
  };
  db.pool.getConnection = async () => ({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('COUNT(*)')) {
        return [[{ count: rows.length }]];
      }
      return [rows];
    },
    release() {},
    destroy() {},
  });
  return () => {
    db.pool.query = originalQuery;
    db.pool.getConnection = originalGetConn;
    return calls;
  };
}

test('listTableRows applies sorting and substring filters', async () => {
  const restore = mockPool();
  const result = await db.listTableRows('users', {
    filters: { name: 'Bob' },
    sort: { column: 'id', dir: 'desc' },
    perPage: 10,
  });
  const calls = restore();
  const main = calls.find((c) => c.sql.startsWith('SELECT *'));
  assert.ok(main.sql.includes('ORDER BY `id` DESC'));
  assert.ok(main.sql.toLowerCase().includes('like'));
  assert.ok(main.sql.includes('%Bob%'));
  assert.equal(result.rows[0].name, 'Bob Smith');
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

test('listTableRows scopes company_id with tenant tables', async () => {
  const restore = mockPool({ tenant: { is_shared: 0, seed_on_create: 0 } });
  await db.listTableRows('tenant', {
    filters: { company_id: 9 },
  });
  const calls = restore();
  const count = calls.find((c) => c.sql.includes('COUNT(*)'));
  assert.ok(/`company_id`\s*=\s*\?/i.test(count.sql));
});

test('listTableRows allows zero-valued filters', async () => {
  const restore = mockPool({ tenant: { is_shared: 0, seed_on_create: 0 } });
  const result = await db.listTableRows('tenant', {
    filters: { company_id: 0 },
  });
  const calls = restore();
  const count = calls.find((c) => c.sql.includes('COUNT(*)'));
  assert.equal(result.rows.length, 1);
  assert.ok(/`company_id`\s*=\s*\?/i.test(count.sql));
  assert.equal(count.params?.[1], 0);
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

test('listTableRows filters soft-deleted rows by default', async () => {
  const restore = mockPool(
    {},
    [{ id: 1, name: 'Active User', is_deleted: 0 }],
    ['company_id', 'id', 'name', 'is_deleted'],
  );
  await db.listTableRows('soft_users', {
    filters: { company_id: 5 },
  });
  const calls = restore();
  const main = calls.find((c) => c.sql.startsWith('SELECT *'));
  assert.ok(
    main.sql.includes("(`is_deleted` IS NULL OR `is_deleted` IN (0,''))"),
    'soft delete filter should be applied',
  );
  const count = calls.find((c) => c.sql.includes('COUNT(*)'));
  assert.ok(
    count.sql.includes("(`is_deleted` IS NULL OR `is_deleted` IN (0,''))"),
    'count query should include soft delete filter',
  );
});

test('listTableRows can include soft-deleted rows when requested', async () => {
  const restore = mockPool(
    {},
    [{ id: 2, name: 'Deleted User', is_deleted: 1 }],
    ['company_id', 'id', 'name', 'is_deleted'],
  );
  await db.listTableRows('soft_users', {
    filters: { company_id: 5 },
    includeDeleted: true,
  });
  const calls = restore();
  const main = calls.find((c) => c.sql.startsWith('SELECT *'));
  assert.ok(
    !main.sql.includes("(`is_deleted` IS NULL OR `is_deleted` IN (0,''))"),
    'soft delete filter should be omitted when includeDeleted is true',
  );
  const count = calls.find((c) => c.sql.includes('COUNT(*)'));
  assert.ok(
    !count.sql.includes("(`is_deleted` IS NULL OR `is_deleted` IN (0,''))"),
    'count query should omit soft delete filter when includeDeleted is true',
  );
});


test('listTableRows applies date-only equality for date-like filters', async () => {
  const restore = mockPool({}, [{ id: 1, created_at: '2026-01-01 12:00:00' }], ['company_id', 'id', 'created_at']);
  await db.listTableRows('users', {
    filters: { created_at: '2026-01-01' },
  });
  const calls = restore();
  const main = calls.find((c) => c.sql.startsWith('SELECT *'));
  assert.ok(main.sql.includes('DATE(`created_at`) ='));
});

test('listTableRows applies date-only ranges for date-like range filters', async () => {
  const restore = mockPool({}, [{ id: 1, created_at: '2026-01-01 12:00:00' }], ['company_id', 'id', 'created_at']);
  await db.listTableRows('users', {
    filters: { created_at: '2026-01-01-2026-01-31' },
  });
  const calls = restore();
  const main = calls.find((c) => c.sql.startsWith('SELECT *'));
  assert.ok(main.sql.includes('DATE(`created_at`) BETWEEN'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

await test('seedTenantTables copies user level permissions', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[]];
    }
    return [[], []];
  };
  await db.seedTenantTables(7);
  db.pool.query = orig;
  const insertCall = calls.find((c) => /INSERT INTO user_level_permissions/.test(c.sql));
  assert.ok(insertCall);
  assert.deepEqual(insertCall.params, [7]);
  assert.match(
    insertCall.sql,
    /SELECT \?,\s*userlevel_id, action, action_key\s+FROM user_level_permissions\s+WHERE company_id = 0/,
  );
});

await test('seedTenantTables filters by record ids', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    return [[], []];
  };
  await db.seedTenantTables(7, null, { posts: [1, 2] });
  db.pool.query = orig;
  const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO ??'));
  assert.ok(insertCall);
  assert.match(insertCall.sql, /IN \(\?, \?\)/);
  assert.deepEqual(insertCall.params, ['posts', 7, 'posts', 1, 2]);
});

await test('seedDefaultsForSeedTables updates company ids to 0', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name FROM tenant_tables')) {
      return [[{ table_name: 't1' }, { table_name: 't2' }]];
    }
    return [[], []];
  };
  await db.seedDefaultsForSeedTables();
  db.pool.query = orig;
  const updates = calls.filter((c) => c.sql.startsWith('UPDATE ?? SET company_id'));
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0].params, ['t1', 0]);
  assert.deepEqual(updates[1].params, ['t2', 0]);
});

await test('seedSeedTablesForCompanies seeds all companies', async () => {
  const origQuery = db.pool.query;
  const companyIds = [];
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT id FROM companies')) {
      return [[{ id: 1 }, { id: 2 }]];
    }
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      companyIds.push(params[0]);
    }
    return [[], []];
  };
  await db.seedSeedTablesForCompanies();
  db.pool.query = origQuery;
  assert.deepEqual(companyIds, [1, 2]);
});


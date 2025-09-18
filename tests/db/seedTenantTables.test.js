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
  await db.seedTenantTables(7, null, {}, false, 1);
  db.pool.query = orig;
  const insertCall = calls.find((c) => /INSERT INTO user_level_permissions/.test(c.sql));
  assert.ok(insertCall);
  assert.deepEqual(insertCall.params, [7, 1]);
  assert.match(
    insertCall.sql,
    /user_level_permissions \(company_id, userlevel_id, action, action_key, created_by, created_at\)/,
  );
  assert.match(
    insertCall.sql,
    /SELECT \?,\s*userlevel_id, action, action_key, \?, NOW\(\)\s+FROM user_level_permissions\s+WHERE company_id = 0/,
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
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 0 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    if (sql.startsWith('INSERT INTO ??')) {
      return [{ affectedRows: 2 }];
    }
    return [[], []];
  };
  const summary = await db.seedTenantTables(7, null, { posts: [1, 2] }, false, 1);
  db.pool.query = orig;
  const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO ??'));
  assert.ok(insertCall);
  assert.match(insertCall.sql, /IN \(\?, \?\)/);
  assert.deepEqual(insertCall.params, ['posts', 7, 'posts', 1, 2]);
  assert.deepEqual(summary, { posts: { count: 2, ids: [1, 2] } });
});

await test('seedTenantTables returns summary for provided rows', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 0 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    if (sql.startsWith('SELECT column_name, mn_label FROM table_column_labels')) {
      return [[]];
    }
    if (sql.startsWith('INSERT INTO ?? (`company_id`, `id`, `title`)')) {
      return [{ affectedRows: 1, insertId: 77 }];
    }
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      return [{ affectedRows: 0 }];
    }
    return [[], []];
  };
  const summary = await db.seedTenantTables(
    9,
    null,
    { posts: [{ id: 55, title: 'Hello' }] },
    false,
    42,
  );
  db.pool.query = orig;
  assert.deepEqual(summary, { posts: { count: 1, ids: [55] } });
  const insert = calls.find((c) =>
    c.sql.startsWith('INSERT INTO ?? (`company_id`, `id`, `title`)'),
  );
  assert.ok(insert);
});

await test('seedTenantTables overrides audit columns', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 0 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'created_by', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'created_at', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'updated_by', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'updated_at', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    return [[], []];
  };
  await db.seedTenantTables(7, ['posts'], {}, false, 123, 456);
  db.pool.query = orig;
  const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO ??'));
  assert.ok(insertCall);
  assert.match(
    insertCall.sql,
    /SELECT \? AS company_id, `id`, \?, NOW\(\), \?, NOW\(\)/,
  );
  assert.deepEqual(insertCall.params, ['posts', 7, 123, 456, 'posts']);
});

await test('seedTenantTables throws when table has data and overwrite false', async () => {
  const orig = db.pool.query;
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 5 }]];
    }
    return [[], []];
  };
  await assert.rejects(() => db.seedTenantTables(7, null, {}, false, 1), /already contains data/);
  db.pool.query = orig;
});

await test('seedDefaultsForSeedTables updates audit columns when present', async () => {
  const origQuery = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name FROM tenant_tables')) {
      return [[{ table_name: 't1' }, { table_name: 't2' }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'updated_by' },
        { COLUMN_NAME: 'updated_at' },
      ]];
    }
    return [[], []];
  };
  await db.seedDefaultsForSeedTables(55);
  db.pool.query = origQuery;
  const updates = calls.filter((c) => c.sql.startsWith('UPDATE ?? SET company_id'));
  assert.equal(updates.length, 2);
  assert.match(updates[0].sql, /updated_by = \?, updated_at = NOW\(\)/);
  assert.deepEqual(updates[0].params, ['t1', 0, 55, 0]);
  assert.deepEqual(updates[1].params, ['t2', 0, 55, 0]);
});

await test('zeroSharedTenantKeys updates audit columns when present', async () => {
  const origQuery = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name FROM tenant_tables')) {
      return [[{ table_name: 't1' }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'updated_by' },
        { COLUMN_NAME: 'updated_at' },
      ]];
    }
    return [[], []];
  };
  await db.zeroSharedTenantKeys(77);
  db.pool.query = origQuery;
  const update = calls.find((c) => c.sql.startsWith('UPDATE ?? SET company_id'));
  assert.ok(update);
  assert.match(update.sql, /updated_by = \?, updated_at = NOW\(\)/);
  assert.deepEqual(update.params, ['t1', 0, 77]);
});

await test('seedSeedTablesForCompanies seeds all companies', async () => {
  const origQuery = db.pool.query;
  const inserts = [];
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT id FROM companies')) {
      return [[{ id: 1 }, { id: 2 }]];
    }
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      inserts.push(params);
    }
    return [[], []];
  };
  await db.seedSeedTablesForCompanies(55);
  db.pool.query = origQuery;
  assert.deepEqual(inserts, [
    [1, 55],
    [2, 55],
  ]);
});


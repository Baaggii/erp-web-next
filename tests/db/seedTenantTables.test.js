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

import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test('setTenantFlags includes updated_by and updated_at', async () => {
  const calls = [];
  const orig = db.pool.query;
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('INSERT INTO tenant_feature_flags')) return [{}];
    if (sql.startsWith('SELECT flag_key')) return [[{ flag_key: 'a', flag_value: 1 }]];
    return [{}];
  };
  const result = await db.setTenantFlags(1, { a: true }, 'E1');
  db.pool.query = orig;
  assert.ok(calls[0].sql.includes('updated_by'));
  assert.ok(calls[0].sql.includes('updated_at'));
  assert.deepEqual(calls[0].params.slice(0, 4), [1, 'a', 1, 'E1']);
  assert.match(calls[0].params[4], /\d{4}-\d{2}-\d{2}/);
  assert.deepEqual(result, { a: true });
});

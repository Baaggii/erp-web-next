import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test('setCompanyModuleLicense inserts audit columns for new license', async () => {
  const calls = [];
  const orig = db.pool.query;
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return [{}];
  };
  await db.setCompanyModuleLicense(7, 'reports', true, 'EMP1');
  db.pool.query = orig;
  assert.ok(calls[0].sql.includes('created_by'));
  assert.ok(calls[0].sql.includes('updated_by'));
  assert.ok(/updated_by = VALUES\(updated_by\)/.test(calls[0].sql));
  assert.deepEqual(calls[0].params, [7, 'reports', 1, 'EMP1', 'EMP1']);
});

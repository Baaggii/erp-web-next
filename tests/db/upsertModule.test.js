import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test('upsertModule includes created_by, updated_by, and updated_at', async () => {
  const calls = [];
  const orig = db.pool.query;
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return [{}];
  };
  await db.upsertModule('t', 'T', null, true, false, 'E1');
  db.pool.query = orig;
  assert.ok(calls[0].sql.includes('created_by'));
  assert.ok(calls[0].sql.includes('updated_by'));
  assert.ok(calls[0].sql.includes('updated_at'));
  assert.deepEqual(calls[0].params.slice(0, 7), ['t', 'T', null, 1, 0, 'E1', 'E1']);
  assert.match(calls[0].params[7], /\d{4}-\d{2}-\d{2}/);
});

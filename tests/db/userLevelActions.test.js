import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test('getUserLevelActions includes company-specific permissions', async () => {
  const orig = db.pool.query;
  let capturedSql = '';
  let capturedParams = [];
  db.pool.query = async (sql, params) => {
    capturedSql = sql;
    capturedParams = params;
    return [[{ action: 'module_key', action_key: 'm1' }]];
  };
  const perms = await db.getUserLevelActions(2, 5);
  db.pool.query = orig;
  assert.equal(perms.m1, true);
  assert.match(capturedSql, /company_id IN \(0, \?\)/);
  assert.deepEqual(capturedParams, [2, 5]);
});

test('setUserLevelActions uses provided company id', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return [[], []];
  };
  await db.setUserLevelActions(
    2,
    { modules: ['m1'], buttons: [], functions: [], api: [], permissions: [] },
    5,
  );
  db.pool.query = orig;
  assert.match(calls[0].sql, /company_id = 5/);
  assert.deepEqual(calls[0].params, [2]);
  assert.match(calls[1].sql, /\(5, \?,'module_key',\?\)/);
});

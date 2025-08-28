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
  assert.match(capturedSql, /company_id = \? AND userlevel_id = \?/);
  assert.deepEqual(capturedParams, [5, 2]);
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
  assert.equal(
    calls[0].sql,
    'DELETE FROM user_level_permissions WHERE userlevel_id = ? AND action IS NOT NULL AND company_id = ?',
  );
  assert.deepEqual(calls[0].params, [2, 5]);
  assert.match(calls[1].sql, /\(5, \?,'module_key',\?\)/);
});

test('setUserLevelActions removes existing permissions', async () => {
  const orig = db.pool.query;
  const rows = [];
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      rows.push({
        company_id: params[0],
        userlevel_id: params[1],
        action: params[2],
        action_key: params[3],
      });
      return [[], []];
    }
    if (sql.startsWith('DELETE FROM user_level_permissions')) {
      const [ul, cid] = params;
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.userlevel_id === ul && r.company_id === cid && r.action !== null) {
          rows.splice(i, 1);
        }
      }
      return [[], []];
    }
    throw new Error('Unexpected SQL: ' + sql);
  };

  await db.pool.query(
    'INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key) VALUES (?, ?, ?, ?)',
    [5, 2, 'module_key', 'm1'],
  );
  assert.equal(rows.length, 1);
  await db.setUserLevelActions(
    2,
    { modules: [], buttons: [], functions: [], api: [], permissions: [] },
    5,
  );
  db.pool.query = orig;
  assert.equal(rows.length, 0);
});

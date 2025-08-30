import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test('listUserCompanies joins branch with company scope', async () => {
  const orig = db.pool.query;
  let capturedSql = '';
  db.pool.query = async (sql) => {
    capturedSql = sql;
    return [[]];
  };
  await db.listUserCompanies(1);
  db.pool.query = orig;
  assert.match(
    capturedSql,
    /LEFT JOIN code_branches b ON uc\.branch_id = b\.id AND b\.company_id = uc\.company_id/
  );
});

test('listAllUserCompanies joins branch with company scope', async () => {
  const orig = db.pool.query;
  let capturedSql = '';
  db.pool.query = async (sql) => {
    capturedSql = sql;
    return [[]];
  };
  await db.listAllUserCompanies();
  db.pool.query = orig;
  assert.match(
    capturedSql,
    /LEFT JOIN code_branches b ON uc\.branch_id = b\.id AND b\.company_id = uc\.company_id/
  );
});

test('listAllUserCompanies filters by created_by when provided', async () => {
  const orig = db.pool.query;
  let capturedSql = '';
  let capturedParams;
  db.pool.query = async (sql, params) => {
    capturedSql = sql;
    capturedParams = params;
    return [[]];
  };
  await db.listAllUserCompanies(null, 5);
  db.pool.query = orig;
  assert.match(capturedSql, /WHERE c\.created_by = \?/);
  assert.equal(capturedParams[0], 5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test('listReportProcedures filters by prefix', async () => {
  const original = db.pool.query;
  db.pool.query = async (sql, params) => {
    if (/information_schema\.ROUTINES/i.test(sql)) {
      return [[{ ROUTINE_NAME: 'bbb_proc' }]];
    }
    return [[]];
  };
  const names = await db.listReportProcedures('proc');
  db.pool.query = original;
  assert.deepEqual(names, ['bbb_proc']);
});

test('deleteProcedure drops routine', async () => {
  const calls = [];
  const original = db.pool.query;
  db.pool.query = async (sql) => {
    calls.push(sql);
    return [];
  };
  await db.deleteProcedure('proc_a');
  db.pool.query = original;
  assert.ok(calls[0].includes('DROP PROCEDURE IF EXISTS `proc_a`'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test('listReportProcedures returns routine names', async () => {
  const original = db.pool.query;
  db.pool.query = async (sql) => {
    if (/information_schema\.ROUTINES/i.test(sql)) {
      return [[{ ROUTINE_NAME: 'report_a' }, { ROUTINE_NAME: 'report_b' }]];
    }
    return [[]];
  };
  const names = await db.listReportProcedures();
  db.pool.query = original;
  assert.deepEqual(names, ['report_a', 'report_b']);
});

test('deleteProcedure drops routine', async () => {
  const calls = [];
  const original = db.pool.query;
  db.pool.query = async (sql) => {
    calls.push(sql);
    return [];
  };
  await db.deleteProcedure('report_a');
  db.pool.query = original;
  assert.ok(calls[0].includes('DROP PROCEDURE IF EXISTS `report_a`'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import buildStoredProcedure from '../../src/erp.mgt.mn/utils/buildStoredProcedure.js';

// minimal report definition
const report = { from: { table: 'tbl' } };

test('buildStoredProcedure inserts configured prefix', () => {
  const sql = buildStoredProcedure({
    name: 'sales',
    report,
    prefix: 'sp_',
  });
  assert.ok(sql.includes('DROP PROCEDURE IF EXISTS report_sp_sales;'));
  assert.ok(sql.includes('CREATE PROCEDURE report_sp_sales('));
});

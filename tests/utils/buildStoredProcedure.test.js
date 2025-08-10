import test from 'node:test';
import assert from 'node:assert/strict';
import buildStoredProcedure from '../../src/erp.mgt.mn/utils/buildStoredProcedure.js';

// minimal report definition
const report = { from: { table: 'tbl' } };

test('buildStoredProcedure appends configured suffix', () => {
  const sql = buildStoredProcedure({
    name: 'sales',
    report,
    suffix: '_sp',
  });
  assert.ok(sql.includes('DROP PROCEDURE IF EXISTS report_sales_sp;'));
  assert.ok(sql.includes('CREATE PROCEDURE report_sales_sp('));
});

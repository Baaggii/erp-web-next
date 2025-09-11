import test from 'node:test';
import assert from 'node:assert/strict';
import buildStoredProcedure from '../../src/erp.mgt.mn/utils/buildStoredProcedure.js';
import parseProcedureConfig from '../../utils/parseProcedureConfig.js';

// minimal report definition
const report = { from: { table: 'tbl' } };

test('buildStoredProcedure inserts configured prefix', () => {
  const sql = buildStoredProcedure({
    name: 'sales',
    report,
    prefix: 'sp_',
  });
  assert.ok(sql.includes('DROP PROCEDURE IF EXISTS sp_sales;'));
  assert.ok(sql.includes('CREATE PROCEDURE sp_sales('));
});

test('buildStoredProcedure embeds REPORT_BUILDER_CONFIG block', () => {
  const config = { procName: 'sales', unionQueries: [] };
  const sql = buildStoredProcedure({ name: 'sales', report, config });
  const parsed = parseProcedureConfig(sql);
  assert.deepEqual(parsed, { report: config, converted: false });
});

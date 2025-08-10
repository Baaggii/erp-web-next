import test from 'node:test';
import assert from 'node:assert/strict';
import buildReportSql from '../../src/erp.mgt.mn/utils/buildReportSql.js';

test('buildReportSql adds non aggregated fields to group by', () => {
  const sql = buildReportSql({
    from: { table: 'sales', alias: 's' },
    select: [
      { expr: 's.category', alias: 'category' },
      { expr: 'SUM(s.amount)', alias: 'total' },
    ],
  });
  assert.ok(sql.includes('GROUP BY category'));
  assert.ok(!sql.match(/GROUP BY.*GROUP BY/));
});

test('buildReportSql unions additional queries', () => {
  const sql = buildReportSql({
    from: { table: 'sales', alias: 's' },
    select: [{ expr: 's.id' }],
    unions: [
      {
        type: 'UNION ALL',
        from: { table: 'sales_archive', alias: 'sa' },
        select: [{ expr: 'sa.id' }],
      },
    ],
  });
  assert.ok(sql.includes('FROM sales s'));
  assert.ok(sql.includes('UNION ALL'));
  assert.ok(sql.includes('FROM sales_archive sa'));
});

test('buildReportSql allows parenthesized conditions', () => {
  const sql = buildReportSql({
    from: { table: 'tbl', alias: 't' },
    select: [{ expr: 't.id' }],
    where: [
      { expr: 't.branchid = :bid', open: 1 },
      { expr: 't.alt_branch = :bid', connector: 'OR', close: 1 },
    ],
  });
  assert.ok(/\(t.branchid = :bid\s*OR t.alt_branch = :bid\)/.test(sql));
});

test('buildReportSql handles recursive aliases without hanging', () => {
  const sql = buildReportSql({
    from: { table: 'tbl', alias: 't' },
    select: [
      { expr: 'b', alias: 'a' },
      { expr: 'a', alias: 'b' },
      { expr: 'a', alias: 'c' },
    ],
  });
  assert.ok(sql.includes('SELECT'));
});

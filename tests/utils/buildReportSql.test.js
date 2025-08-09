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

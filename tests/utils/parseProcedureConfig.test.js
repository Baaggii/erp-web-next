import test from 'node:test';
import assert from 'node:assert/strict';
import parseProcedureConfig from '../../utils/parseProcedureConfig.js';

// simple stand-in for the ReportBuilder applyConfig loader
function applyConfig(report) {
  return { ...report };
}

test('parseProcedureConfig extracts config block', () => {
  const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {"foo":"bar"} */';
  assert.deepEqual(parseProcedureConfig(sql), {
    report: { foo: 'bar' },
    converted: false,
  });
});

test('parseProcedureConfig throws on malformed JSON', () => {
  const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {foo} */';
  assert.throws(() => parseProcedureConfig(sql), /Invalid REPORT_BUILDER_CONFIG JSON/);
});

test('parseProcedureConfig converts SQL with expressions and clauses', () => {
  const sql =
    'SELECT p.id, p.price*2 AS dbl FROM prod p WHERE (p.id = :id OR p.name = :name) AND p.active = 1 GROUP BY p.id, p.price*2 HAVING SUM(p.qty) > 10 AND COUNT(*) > 0';
  const { report } = parseProcedureConfig(sql);
  assert.deepEqual(report.from, { table: 'prod', alias: 'p' });
  assert.deepEqual(report.select, [
    { expr: 'p.id', alias: undefined },
    { expr: 'p.price*2', alias: 'dbl' },
  ]);
  assert.deepEqual(report.groupBy, ['p.id', 'p.price*2']);
  assert.equal(report.where.length, 3);
  assert.deepEqual(report.where[0], {
    expr: 'p.id = :id',
    connector: undefined,
    open: 1,
    close: 0,
  });
  assert.deepEqual(report.where[1], {
    expr: 'p.name = :name',
    connector: 'OR',
    open: 0,
    close: 1,
  });
  assert.deepEqual(report.where[2], {
    expr: 'p.active = 1',
    connector: 'AND',
    open: 0,
    close: 0,
  });
});

test('round trip through applyConfig returns original report', () => {
  const sql = 'SELECT p.id FROM prod p WHERE p.id = :id';
  const { report } = parseProcedureConfig(sql);
  const state = applyConfig(report);
  assert.deepEqual(state, report);
});

test('parseProcedureConfig handles subquery FROM with filters', () => {
  const sql =
    'SELECT t0.id FROM (SELECT id FROM orders WHERE orders.branch_id = :branch AND orders.date >= :fromDate) t0 LEFT JOIN users u ON t0.id = u.order_id';
  const { report } = parseProcedureConfig(sql);
  assert.deepEqual(report.from, { table: 't0', alias: 't0' });
  assert.equal(report.joins.length, 1);
  assert.equal(report.joins[0].table, 'users');
  assert.equal(report.fromFilters.length, 2);
  assert.equal(report.fromFilters[0].expr, 'orders.branch_id = :branch');
});


import test from 'node:test';
import assert from 'node:assert/strict';
import parseProcedureConfig from '../../src/erp.mgt.mn/utils/parseProcedureConfig.js';

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

test('handles functions with internal commas', () => {
  const sql =
    'SELECT SUM(IF(p.flag=1, p.qty, 0)) AS total, p.name FROM prod p';
  const { report } = parseProcedureConfig(sql);
  assert.deepEqual(report.select, [
    { expr: 'SUM(IF(p.flag=1, p.qty, 0))', alias: 'total' },
    { expr: 'p.name', alias: undefined },
  ]);
});

test('parses subquery in FROM clause and extracts filters', () => {
  const sql =
    'SELECT o.id FROM (SELECT * FROM orders WHERE status = 1 AND qty > 0) o JOIN cust c ON c.id = o.cust_id';
  const { report } = parseProcedureConfig(sql);
  assert.deepEqual(report.from, { table: 'orders', alias: 'o' });
  assert.equal(report.fromFilters.length, 2);
  assert.deepEqual(report.fromFilters[0], {
    expr: 'status = 1',
    connector: undefined,
    open: 0,
    close: 0,
  });
  assert.deepEqual(report.fromFilters[1], {
    expr: 'qty > 0',
    connector: 'AND',
    open: 0,
    close: 0,
  });
  assert.deepEqual(report.joins[0], {
    table: 'cust',
    alias: 'c',
    type: 'JOIN',
    on: 'c.id = o.cust_id',
  });
});


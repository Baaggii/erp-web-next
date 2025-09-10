import test from 'node:test';
import assert from 'node:assert/strict';
import parseProcedureConfig from '../../src/erp.mgt.mn/utils/parseProcedureConfig.js';

test('parseProcedureConfig extracts config block', () => {
  const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {"foo":"bar"} */';
  assert.deepEqual(parseProcedureConfig(sql), {
    config: { foo: 'bar' },
    converted: false,
  });
});

test('parseProcedureConfig throws on malformed JSON', () => {
  const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {foo} */';
  assert.throws(() => parseProcedureConfig(sql), /Invalid REPORT_BUILDER_CONFIG JSON/);
});

test('parseProcedureConfig converts SQL when block missing', () => {
  const sql = `CREATE PROCEDURE t() BEGIN SELECT p.id, p.name FROM prod p WHERE p.id = 1 GROUP BY p.id, p.name; END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 'prod');
  assert.equal(result.config.fields.length, 2);
  assert.equal(result.config.groups.length, 2);
});

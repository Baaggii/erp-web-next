import test from 'node:test';
import assert from 'node:assert/strict';
import parseProcedureConfig from '../../src/erp.mgt.mn/utils/parseProcedureConfig.js';

test('parseProcedureConfig extracts config', () => {
  const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {"foo":"bar"} */';
  assert.deepEqual(parseProcedureConfig(sql), { foo: 'bar' });
});

test('parseProcedureConfig throws on malformed JSON', () => {
  const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {foo} */';
  assert.throws(() => parseProcedureConfig(sql), /Invalid REPORT_BUILDER_CONFIG JSON/);
});

test('parseProcedureConfig returns null when block missing', () => {
  const sql = 'SELECT 1;';
  assert.equal(parseProcedureConfig(sql), null);
});

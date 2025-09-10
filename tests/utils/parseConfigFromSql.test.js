import test from 'node:test';
import assert from 'node:assert/strict';
import parseConfigFromSql from '../../src/erp.mgt.mn/utils/parseConfigFromSql.js';

test('parseConfigFromSql extracts valid JSON', () => {
  const sql = 'SELECT 1;/* RB_CONFIG{"a":1}RB_CONFIG */';
  const { config, error } = parseConfigFromSql(sql);
  assert.deepEqual(config, { a: 1 });
  assert.equal(error, null);
});

test('parseConfigFromSql reports missing block', () => {
  const sql = 'SELECT 1;';
  const { config, error } = parseConfigFromSql(sql);
  assert.equal(config, null);
  assert.equal(error, 'No embedded config found');
});

test('parseConfigFromSql reports invalid JSON', () => {
  const sql = '/* RB_CONFIG{a:1}RB_CONFIG */';
  const { config, error } = parseConfigFromSql(sql);
  assert.equal(config, null);
  assert.equal(error, 'Invalid RB_CONFIG JSON');
});

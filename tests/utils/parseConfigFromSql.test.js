import test from 'node:test';
import assert from 'node:assert/strict';
import parseConfigFromSql from '../../src/erp.mgt.mn/utils/parseConfigFromSql.js';

test('parseConfigFromSql extracts valid config', () => {
  const sql = "SELECT 1; /* RB_CONFIG {\"foo\":\"bar\"} RB_CONFIG */";
  assert.deepEqual(parseConfigFromSql(sql), { foo: 'bar' });
});

test('parseConfigFromSql throws on malformed JSON', () => {
  const sql = "SELECT 1; /* RB_CONFIG {foo:'bar'} RB_CONFIG */";
  assert.throws(() => parseConfigFromSql(sql), /Invalid RB_CONFIG JSON/);
});

test('parseConfigFromSql returns null when block missing', () => {
  const sql = 'SELECT 1;';
  assert.equal(parseConfigFromSql(sql), null);
});

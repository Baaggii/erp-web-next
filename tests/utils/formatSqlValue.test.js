import test from 'node:test';
import assert from 'node:assert/strict';
import formatSqlValue from '../../src/erp.mgt.mn/utils/formatSqlValue.js';

test('formatSqlValue quotes string types', () => {
  assert.equal(formatSqlValue('foo', 'varchar'), "'foo'");
  assert.equal(formatSqlValue("O'Reilly", 'char'), "'O''Reilly'");
});

test('formatSqlValue leaves numbers unquoted', () => {
  assert.equal(formatSqlValue('123', 'int'), '123');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { detectType } from '../../api-server/controllers/codingTableController.js';

test('detectType treats _per fields as percent', () => {
  assert.equal(detectType('discount_per', []), 'DECIMAL(5,2)');
});

test('detectType ignores per when not preceded by underscore', () => {
  assert.notEqual(detectType('percentage', []), 'DECIMAL(5,2)');
  assert.notEqual(detectType('person', []), 'DECIMAL(5,2)');
});

test('detectType limits VARCHAR length to max data length', () => {
  const vals = ['a', 'abcd', 'abc'];
  assert.equal(detectType('name', vals), 'VARCHAR(4)');
});

test('detectType ignores Excel error values', () => {
  const vals = ['#N/A', '#VALUE!', '123'];
  assert.equal(detectType('amount', vals), 'INT');
});

test('detectType ignores special character values', () => {
  const vals = ['-', '+', '123'];
  assert.equal(detectType('amount', vals), 'INT');
});

test('detectType handles Mongolian text as string', () => {
  const vals = ['Монгол'];
  assert.equal(detectType('desc', vals), 'VARCHAR(6)');
});

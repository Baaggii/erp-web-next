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

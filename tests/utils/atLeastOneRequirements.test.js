import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAtLeastOneGroups,
  isValueFilled,
  findMissingAtLeastOneGroups,
} from '../../src/erp.mgt.mn/utils/atLeastOneRequirements.js';

test('normalizeAtLeastOneGroups filters invalid groups and duplicate fields', () => {
  const result = normalizeAtLeastOneGroups([
    ['field_a', 'field_a', ' field_b '],
    [''],
    null,
    ['field_c'],
  ]);

  assert.deepEqual(result, [
    ['field_a', 'field_b'],
    ['field_c'],
  ]);
});

test('isValueFilled handles primitives and relation values', () => {
  assert.equal(isValueFilled('abc'), true);
  assert.equal(isValueFilled('  '), false);
  assert.equal(isValueFilled(0), true);
  assert.equal(isValueFilled([]), false);
  assert.equal(isValueFilled([1]), true);
  assert.equal(isValueFilled({ value: 'x' }), true);
  assert.equal(isValueFilled({ value: '' }), false);
});

test('findMissingAtLeastOneGroups returns only missing groups', () => {
  const groups = [['email', 'phone'], ['tax_id', 'register_id']];
  const missing = findMissingAtLeastOneGroups(
    { email: '', phone: '', tax_id: 'AA-123' },
    groups,
  );

  assert.deepEqual(missing, [['email', 'phone']]);
});

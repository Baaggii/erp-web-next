import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCombinationPairs,
  filterOptionsByCombination,
} from '../../src/erp.mgt.mn/utils/relationCombination.js';

await test('normalizeCombinationPairs filters invalid entries', () => {
  const result = normalizeCombinationPairs([
    { sourceField: 'util_id', targetField: 'utility_id' },
    { source: ' zone_id ', target: ' zone_code ' },
    { sourceField: '', targetField: 'missing' },
    null,
  ]);
  assert.deepEqual(result, [
    { sourceField: 'util_id', targetField: 'utility_id' },
    { sourceField: 'zone_id', targetField: 'zone_code' },
  ]);
});

await test('filterOptionsByCombination returns matching options when filters active', () => {
  const options = [
    { value: 1, label: 'Band A' },
    { value: 2, label: 'Band B' },
  ];
  const combinationMap = {
    band_id: [{ sourceField: 'util_id', targetField: 'utility_id' }],
  };
  const relationRows = {
    band_id: {
      1: { utility_id: 10 },
      2: { utility_id: 20 },
    },
  };
  const formValues = { util_id: 20 };
  const filtered = filterOptionsByCombination({
    column: 'band_id',
    options,
    combinationMap,
    rowValues: formValues,
    relationRowsByColumn: relationRows,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].value, 2);
});

await test('filterOptionsByCombination keeps all options when source empty', () => {
  const options = [
    { value: 'x', label: 'X' },
    { value: 'y', label: 'Y' },
  ];
  const filtered = filterOptionsByCombination({
    column: 'band_id',
    options,
    combinationMap: { band_id: [{ sourceField: 'util_id', targetField: 'utility_id' }] },
    rowValues: { util_id: '' },
    relationRowsByColumn: {},
  });
  assert.equal(filtered.length, 2);
});

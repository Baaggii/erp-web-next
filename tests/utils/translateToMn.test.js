import test from 'node:test';
import assert from 'node:assert/strict';
import { translateToMn } from '../../src/erp.mgt.mn/utils/translateToMn.js';

test('translateToMn uses dictionary', () => {
  assert.equal(translateToMn('year'), 'он');
  assert.equal(translateToMn('month'), 'сар');
});

test('translateToMn splits words', () => {
  assert.equal(translateToMn('birth_day'), 'birth өдөр');
});

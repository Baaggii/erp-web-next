import test from 'node:test';
import assert from 'node:assert/strict';
import normalizeBoolean from '../../src/erp.mgt.mn/utils/normalizeBoolean.js';

test('normalizeBoolean respects default when value is nullish', () => {
  assert.equal(normalizeBoolean(undefined, true), true);
  assert.equal(normalizeBoolean(null, true), true);
  assert.equal(normalizeBoolean(undefined, false), false);
});

test('normalizeBoolean interprets booleans and numbers correctly', () => {
  assert.equal(normalizeBoolean(true), true);
  assert.equal(normalizeBoolean(false, true), false);
  assert.equal(normalizeBoolean(1), true);
  assert.equal(normalizeBoolean(0, true), false);
  assert.equal(normalizeBoolean(-3), true);
  assert.equal(normalizeBoolean(NaN, true), true);
  assert.equal(normalizeBoolean(Number.NaN, false), false);
});

test('normalizeBoolean interprets string variants', () => {
  assert.equal(normalizeBoolean('true'), true);
  assert.equal(normalizeBoolean('TRUE'), true);
  assert.equal(normalizeBoolean(' yes '), true);
  assert.equal(normalizeBoolean('1'), true);
  assert.equal(normalizeBoolean('false'), false);
  assert.equal(normalizeBoolean('0'), false);
  assert.equal(normalizeBoolean('no'), false);
  assert.equal(normalizeBoolean('off'), false);
  assert.equal(normalizeBoolean(''), false);
  assert.equal(normalizeBoolean('unknown', true), true);
  assert.equal(normalizeBoolean('unknown', false), false);
});

test('normalizeBoolean handles other values sanely', () => {
  assert.equal(normalizeBoolean(BigInt(0), true), false);
  assert.equal(normalizeBoolean(BigInt(2), false), true);
  assert.equal(normalizeBoolean([], true), true);
  assert.equal(normalizeBoolean([], false), false);
  assert.equal(normalizeBoolean([1], false), true);
  assert.equal(normalizeBoolean(new Date('invalid'), true), true);
  assert.equal(normalizeBoolean(new Date('2024-01-01'), false), true);
  assert.equal(normalizeBoolean({}), true);
});

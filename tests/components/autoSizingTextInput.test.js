import test from 'node:test';
import assert from 'node:assert/strict';

import computeAutoSizingInputWidth, {
  normalizeText,
  toPositiveNumber,
} from '../../src/erp.mgt.mn/components/computeAutoSizingInputWidth.js';

test('normalizeText converts falsy values to empty strings', () => {
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
  assert.equal(normalizeText(123), '123');
  assert.equal(normalizeText('abc'), 'abc');
});

test('toPositiveNumber coerces values safely', () => {
  assert.equal(toPositiveNumber(5), 5);
  assert.equal(toPositiveNumber('8'), 8);
  assert.equal(toPositiveNumber('not-a-number', 2), 2);
  assert.equal(toPositiveNumber(null, 3), 3);
});

test('computeAutoSizingInputWidth respects placeholder length', () => {
  const placeholder = 'enter-your-very-long-parameter-name';
  const width = computeAutoSizingInputWidth({ placeholder });
  assert.equal(width, placeholder.length + 1);
});

test('computeAutoSizingInputWidth respects current value length', () => {
  const value = 'value-that-is-even-longer-than-placeholder';
  const width = computeAutoSizingInputWidth({ value });
  assert.equal(width, value.length + 1);
});

test('computeAutoSizingInputWidth respects minChars and charWidth', () => {
  const width = computeAutoSizingInputWidth({ minChars: 10, charWidth: 2 });
  assert.equal(width, (10 + 1) * 2);
});

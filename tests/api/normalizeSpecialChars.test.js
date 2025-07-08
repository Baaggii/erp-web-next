import test from 'node:test';
import assert from 'node:assert/strict';

function defaultValForType(type) {
  if (!type) return 0;
  const t = String(type).toUpperCase();
  if (t === 'DATE') return 0;
  if (/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|LONG|BIGINT|NUMBER/.test(t)) {
    return 0;
  }
  return '0';
}

function normalizeSpecialChars(val, type) {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed === '' && /\s+/.test(val)) || /^-+$/.test(trimmed)) {
      return defaultValForType(type);
    }
  }
  return val;
}

test('spaces convert to 0 for numeric type', () => {
  assert.equal(normalizeSpecialChars('   ', 'INT'), 0);
});

test('dash converts to "0" for string type', () => {
  assert.equal(normalizeSpecialChars('-', 'VARCHAR(10)'), '0');
});

test('non-matching value unchanged', () => {
  assert.equal(normalizeSpecialChars('abc', 'INT'), 'abc');
});

test('null remains unchanged', () => {
  assert.equal(normalizeSpecialChars(null, 'INT'), null);
});

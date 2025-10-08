import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveScopedCompanyId,
  pickFirstScopeValue,
} from '../../api-server/utils/requestScopes.js';

test('resolveScopedCompanyId keeps user company when not super admin', () => {
  assert.equal(resolveScopedCompanyId(0, 12), 12);
  assert.equal(resolveScopedCompanyId(undefined, 5), 5);
  assert.equal(resolveScopedCompanyId('77', '9'), 9);
});

test('resolveScopedCompanyId allows overrides for company 0', () => {
  assert.equal(resolveScopedCompanyId('77', 0), 77);
  assert.equal(resolveScopedCompanyId(55, '0'), 55);
  assert.equal(resolveScopedCompanyId('not-a-number', 0), 0);
});

test('pickFirstScopeValue prefers first non-empty string', () => {
  assert.equal(pickFirstScopeValue(undefined, null, '  '), null);
  assert.equal(pickFirstScopeValue(' 42 ', null), '42');
  assert.equal(pickFirstScopeValue(null, 0), '0');
  assert.equal(pickFirstScopeValue('', '  value  ', 'next'), 'value');
});

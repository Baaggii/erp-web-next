import test from 'node:test';
import assert from 'node:assert/strict';
import { getTenantKeyList } from '../../src/erp.mgt.mn/utils/tenantKeys.js';

test('getTenantKeyList prefers camelCase tenantKeys', () => {
  const keys = getTenantKeyList({ tenantKeys: ['company_id', 'branch_id'], tenant_keys: ['ignore'] });
  assert.deepEqual(keys, ['company_id', 'branch_id']);
});

test('getTenantKeyList falls back to legacy tenant_keys', () => {
  const keys = getTenantKeyList({ tenant_keys: ['department_id', 3, 'department_id'] });
  assert.deepEqual(keys, ['department_id']);
});

test('getTenantKeyList handles invalid input', () => {
  assert.deepEqual(getTenantKeyList(null), []);
  assert.deepEqual(getTenantKeyList({}), []);
});

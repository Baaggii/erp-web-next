import test from 'node:test';
import assert from 'node:assert/strict';
import filterHeaderModules from '../../src/erp.mgt.mn/utils/filterHeaderModules.js';

test('includes requests when permitted', () => {
  const modules = [
    { module_key: 'requests', label: 'Requests', show_in_header: 1 },
  ];
  const perms = { requests: 1 };
  const result = filterHeaderModules(modules, perms, { keys: new Set() });
  assert.ok(result.find((m) => m.module_key === 'requests'));
});

test('includes txn module without explicit permission', () => {
  const modules = [
    { module_key: 'finance_transactions', label: 'Finance', show_in_header: 1 },
  ];
  const perms = {};
  const txn = { keys: new Set(['finance_transactions']) };
  const result = filterHeaderModules(modules, perms, txn);
  assert.ok(result.find((m) => m.module_key === 'finance_transactions'));
});

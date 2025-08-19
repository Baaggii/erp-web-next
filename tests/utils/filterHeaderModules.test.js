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

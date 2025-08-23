import test from 'node:test';
import assert from 'node:assert/strict';
import defaultModules from '../../db/defaultModules.js';

test('requests module visible in sidebar', () => {
  const mod = defaultModules.find((m) => m.moduleKey === 'requests');
  assert.ok(mod, 'requests module missing');
  assert.equal(mod.showInSidebar, true);
});

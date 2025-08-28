import test from 'node:test';
import assert from 'node:assert/strict';

test('toggleModuleGroupSelection selects and deselects descendants', async () => {
  const { collectModuleKeys, toggleModuleGroupSelection } = await import(
    '../../src/erp.mgt.mn/pages/moduleTreeHelpers.js'
  );
  const tree = {
    key: 'parent',
    children: [
      { key: 'child1' },
      { key: 'child2', children: [{ key: 'grandchild' }] },
    ],
  };
  const keys = collectModuleKeys(tree);
  let selected = [];
  selected = toggleModuleGroupSelection(selected, keys, true);
  assert.deepEqual(new Set(selected), new Set(keys));
  selected = toggleModuleGroupSelection(selected, keys, false);
  assert.deepEqual(selected, []);
});

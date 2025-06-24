import test from 'node:test';
import assert from 'node:assert/strict';

// Provide a minimal DOM implementation for the hook tests
global.document = { createElement: () => ({}) };
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { useTxnModules, refreshTxnModules } from '../../src/erp.mgt.mn/hooks/useTxnModules.js';

function renderHook(hook) {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value;

  function HookWrapper() {
    value = hook();
    return null;
  }

  act(() => {
    root.render(React.createElement(HookWrapper));
  });

  return { get value() { return value; }, unmount: () => root.unmount() };
}

test.skip('refreshTxnModules causes refetch', async () => {
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls++;
    return { ok: true, json: async () => ({ a: { moduleKey: 'one' } }) };
  };

  const { value, unmount } = renderHook(useTxnModules);
  await act(async () => {
    await Promise.resolve();
  });
  assert.deepEqual([...value], ['one']);
  assert.equal(fetchCalls, 1);

  global.fetch = async () => {
    fetchCalls++;
    return { ok: true, json: async () => ({ b: { moduleKey: 'two' } }) };
  };

  await act(async () => {
    refreshTxnModules();
  });
  await act(async () => {
    await Promise.resolve();
  });
  assert.deepEqual([...value], ['two']);
  assert.equal(fetchCalls, 2);
  unmount();
});

import test from 'node:test';
import assert from 'node:assert/strict';

global.document = { createElement: () => ({}) };
let React, act, createRoot, useTxnModules, refreshTxnModules;
let haveReact = true;
try {
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
  ({ useTxnModules, refreshTxnModules } = await import('../../src/erp.mgt.mn/hooks/useTxnModules.js'));
} catch {
  haveReact = false;
}

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

if (!haveReact) {
  test('useTxnModules hook', { skip: true }, () => {});
} else {
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
    assert.deepEqual([...value.keys], ['one']);
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
    assert.deepEqual([...value.keys], ['two']);
    assert.equal(fetchCalls, 2);
    unmount();
  });
}



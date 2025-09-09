import test from 'node:test';
import assert from 'node:assert/strict';

global.document = { createElement: () => ({}) };

const listeners = {};
global.window = {
  addEventListener: (type, fn) => {
    listeners[type] = listeners[type] || new Set();
    listeners[type].add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (evt) => {
    const set = listeners[evt.type];
    if (set) {
      for (const fn of Array.from(set)) fn(evt);
    }
  },
};

let React, act, createRoot;
let haveReact = true;
try {
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
} catch {
  haveReact = false;
}

function renderHook(hook) {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value;
  function Wrapper() {
    value = hook();
    return null;
  }
  act(() => {
    root.render(React.createElement(Wrapper));
  });
  return {
    get value() {
      return value;
    },
    unmount: () => root.unmount(),
  };
}

if (!haveReact) {
  test('useGeneralConfig', { skip: true }, () => {});
} else {
  test('listener fires and window.erpDebug updates', async () => {
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    };

    const mod = await import('../../src/erp.mgt.mn/hooks/useGeneralConfig.js');
    const useGeneralConfig = mod.default;
    const { updateCache } = mod;

    updateCache({ general: { editLabelsEnabled: false, debugLoggingEnabled: false } });

    const { value, unmount } = renderHook(() => useGeneralConfig());
    assert.equal(fetchCalled, false);
    assert.equal(value.general.editLabelsEnabled, false);
    assert.equal(window.erpDebug, false);
    assert.equal(listeners.generalConfigUpdated.size, 1);

    await act(async () => {
      updateCache({ general: { editLabelsEnabled: true, debugLoggingEnabled: true } });
      await Promise.resolve();
    });

    assert.equal(value.general.editLabelsEnabled, true);
    assert.equal(window.erpDebug, true);

    unmount();
    assert.equal(listeners.generalConfigUpdated.size, 0);
  });
}


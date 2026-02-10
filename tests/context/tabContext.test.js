import test from 'node:test';
import assert from 'node:assert/strict';

global.document = { createElement: () => ({}) };

const listeners = {};

global.window = {
  __activeTabKey: 'global',
  addEventListener: (type, fn) => {
    (listeners[type] ||= []).push(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
  },
  dispatchEvent: (evt) => {
    (listeners[evt.type] || []).forEach((fn) => fn(evt));
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

if (!haveReact) {
  test('tab context resets on logout', { skip: true }, () => {});
} else {
  test('tabs reset after logout and subsequent login', async (t) => {
    const { TabProvider, useTabs } = await t.mock.import(
      '../../src/erp.mgt.mn/context/TabContext.jsx',
      {
        '../utils/debug.js': { trackSetState: () => {} },
      },
    );

    function renderHook(hook) {
      const container = document.createElement('div');
      const root = createRoot(container);
      let value;
      function Wrapper() {
        value = hook();
        return null;
      }
      act(() => {
        root.render(React.createElement(TabProvider, null, React.createElement(Wrapper)));
      });
      return {
        get value() {
          return value;
        },
        unmount: () => root.unmount(),
      };
    }

    const { value } = renderHook(() => useTabs());

    act(() => {
      value.openTab({ key: '/foo', label: 'Foo' });
    });
    assert.deepEqual(value.tabs.map((t) => t.key), ['/foo']);

    act(() => {
      window.dispatchEvent({ type: 'auth:logout' });
    });
    assert.equal(value.tabs.length, 0);
    assert.equal(value.activeKey, null);
    assert.deepEqual(value.cache, {});
    assert.equal(window.__activeTabKey, 'global');

    act(() => {
      value.openTab({ key: '/bar', label: 'Bar' });
    });
    assert.deepEqual(value.tabs.map((t) => t.key), ['/bar']);
  });
}

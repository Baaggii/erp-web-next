import test from 'node:test';
import assert from 'node:assert/strict';

global.document = { createElement: () => ({}) };
const listeners = {};
global.window = {
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
  test('language persists after logout', { skip: true }, () => {});
} else {
  test('language setting persists after logout and remount', async (t) => {
    const store = {};
    global.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
    };
    localStorage.clear();
    localStorage.setItem('erp_user_settings', JSON.stringify({ lang: 'mn' }));

    global.fetch = async (url) => {
      if (url.endsWith('/auth/me')) return { ok: false };
      if (url.endsWith('/user/settings')) return { ok: false };
      return { ok: false };
    };

    const { default: AuthProvider, AuthContext } = await t.mock.import(
      '../../src/erp.mgt.mn/context/AuthContext.jsx',
      {
        '../utils/debug.js': { trackSetState: () => {}, debugLog: () => {} },
        '../utils/apiBase.js': { API_BASE: '' },
      },
    );

    let ctx;
    function Capture() {
      ctx = React.useContext(AuthContext);
      return null;
    }

    const container = document.createElement('div');
    let root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(Capture)));
    });

    assert.equal(ctx.userSettings.lang, 'mn');
    assert.equal(JSON.parse(localStorage.getItem('erp_user_settings')).lang, 'mn');

    await act(async () => {
      window.dispatchEvent({ type: 'auth:logout' });
    });

    assert.equal(ctx.userSettings.lang, 'mn');
    assert.equal(JSON.parse(localStorage.getItem('erp_user_settings')).lang, 'mn');

    root.unmount();

    // Remount to simulate new session
    root = createRoot(document.createElement('div'));
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(Capture)));
    });
    assert.equal(ctx.userSettings.lang, 'mn');
    root.unmount();
  });
}

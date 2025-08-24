import test from 'node:test';
import assert from 'node:assert/strict';

global.document = { createElement: () => ({}) };
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
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
  test('request notification hooks', { skip: true }, () => {});
} else {
  test('request notification counts persist across sessions', async (t) => {
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

    const counts = {
      incoming: { pending: 2, accepted: 0, declined: 0 },
      outgoing: { pending: 1, accepted: 0, declined: 0 },
    };
    global.fetch = async (url) => {
      const u = new URL(url, 'http://example.com');
      const status = u.searchParams.get('status');
      if (u.pathname === '/api/pending_request') {
        return { ok: true, json: async () => counts.incoming[status] };
      }
      if (u.pathname === '/api/pending_request/outgoing') {
        return { ok: true, json: async () => counts.outgoing[status] };
      }
      if (u.pathname === '/api/auth/logout') {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const { default: useRequestNotificationCounts } = await t.mock.import(
      '../../src/erp.mgt.mn/hooks/useRequestNotificationCounts.js',
      {
        '../utils/socket.js': {
          connectSocket: () => ({ on: () => {}, off: () => {} }),
          disconnectSocket: () => {},
        },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { requestPollingEnabled: false } }),
        },
      },
    );

    const { logout } = await t.mock.import(
      '../../src/erp.mgt.mn/hooks/useAuth.jsx',
      {
        '../utils/apiBase.js': { API_BASE: '/api' },
      },
    );

    const { value, unmount } = renderHook(() =>
      useRequestNotificationCounts(5, undefined, 'u1'),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      value.markSeen();
    });
    await logout('u1');
    unmount();

    const { value: value2, unmount: unmount2 } = renderHook(() =>
      useRequestNotificationCounts(5, undefined, 'u1'),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    assert.equal(value2.incoming.pending.hasNew, false);
    assert.equal(value2.outgoing.accepted.hasNew, false);
    assert.equal(value2.hasNew, false);

    unmount2();
    counts.incoming.pending = 3;

    const { value: value3, unmount: unmount3 } = renderHook(() =>
      useRequestNotificationCounts(5, undefined, 'u1'),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    assert.equal(value3.incoming.pending.hasNew, true);
    unmount3();
  });

  test('pending request count persists across sessions', async (t) => {
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

    let pendingCount = 5;
    global.fetch = async (url) => {
      const u = new URL(url, 'http://example.com');
      if (u.pathname === '/api/pending_request') {
        return { ok: true, json: async () => pendingCount };
      }
      if (u.pathname === '/api/auth/logout') {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const { default: usePendingRequestCount } = await t.mock.import(
      '../../src/erp.mgt.mn/hooks/usePendingRequestCount.js',
      {
        '../utils/socket.js': {
          connectSocket: () => ({ on: () => {}, off: () => {} }),
          disconnectSocket: () => {},
        },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { requestPollingEnabled: false } }),
        },
      },
    );
    const { logout } = await t.mock.import(
      '../../src/erp.mgt.mn/hooks/useAuth.jsx',
      {
        '../utils/apiBase.js': { API_BASE: '/api' },
      },
    );

    const { value, unmount } = renderHook(() =>
      usePendingRequestCount(5, undefined, 'u1'),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      value.markSeen();
    });
    await logout('u1');
    unmount();

    const { value: value2, unmount: unmount2 } = renderHook(() =>
      usePendingRequestCount(5, undefined, 'u1'),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    assert.equal(value2.hasNew, false);

    unmount2();
    pendingCount = 10;

    const { value: value3, unmount: unmount3 } = renderHook(() =>
      usePendingRequestCount(5, undefined, 'u1'),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    assert.equal(value3.hasNew, true);
    unmount3();
  });
}


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

function createMockSocket() {
  const handlers = new Map();
  return {
    on: (event, handler) => {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
    },
    off: (event, handler) => {
      if (!handlers.has(event)) return;
      if (!handler) {
        handlers.delete(event);
        return;
      }
      const list = handlers.get(event) || [];
      handlers.set(
        event,
        list.filter((item) => item !== handler),
      );
    },
    emit: (event, payload) => {
      const list = handlers.get(event) || [];
      list.forEach((handler) => handler(payload));
    },
  };
}

async function waitForCondition(check, timeoutMs = 1000, stepMs = 10) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return Date.now() - start;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error('Timed out waiting for condition.');
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
        return {
          ok: true,
          json: async () => ({ rows: [], total: counts.incoming[status] }),
        };
      }
      if (u.pathname === '/api/pending_request/outgoing') {
        return {
          ok: true,
          json: async () => ({ rows: [], total: counts.outgoing[status] }),
        };
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
    counts.outgoing.accepted = 1;

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
    assert.equal(value3.outgoing.accepted.hasNew, true);
    assert.equal(value3.hasNew, true);
    unmount3();
  });

  test('stale counts cleared when server reports zero', async (t) => {
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
    localStorage.setItem('u1-incoming-pending-seen', '5');
    localStorage.setItem('u1-outgoing-accepted-seen', '3');

    global.fetch = async (url) => {
      const u = new URL(url, 'http://example.com');
      if (
        u.pathname === '/api/pending_request' ||
        u.pathname === '/api/pending_request/outgoing'
      ) {
        return { ok: true, json: async () => ({ rows: [], total: 0 }) };
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

    const { value, unmount } = renderHook(() =>
      useRequestNotificationCounts(5, undefined, 'u1'),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    assert.equal(value.incoming.pending.hasNew, false);
    assert.equal(value.incoming.pending.newCount, 0);
    assert.equal(value.outgoing.accepted.hasNew, false);
    assert.equal(value.outgoing.accepted.newCount, 0);
    assert.equal(localStorage.getItem('u1-incoming-pending-seen'), '0');
    assert.equal(localStorage.getItem('u1-outgoing-accepted-seen'), '0');

    unmount();
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

  test('request counts update when date filter changes', async (t) => {
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
      'pending:2024-01-01:2024-01-31': 1,
      'pending:2024-02-01:2024-02-29': 2,
    };
    const seenParams = [];
    global.fetch = async (url) => {
      const u = new URL(url, 'http://example.com');
      if (u.pathname === '/api/pending_request') {
        const key = `${u.searchParams.get('status')}:${u.searchParams.get(
          'date_from',
        )}:${u.searchParams.get('date_to')}`;
        seenParams.push(key);
        return {
          ok: true,
          json: async () => ({ rows: [], total: counts[key] ?? 0 }),
        };
      }
      if (u.pathname === '/api/pending_request/outgoing') {
        return { ok: true, json: async () => ({ rows: [], total: 0 }) };
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

    let setFilters;
    const container = document.createElement('div');
    const root = createRoot(container);
    let value;
    function Wrapper() {
      const [filters, updateFilters] = React.useState({
        date_from: '2024-01-01',
        date_to: '2024-01-31',
      });
      setFilters = updateFilters;
      value = useRequestNotificationCounts(5, filters, 'u1');
      return null;
    }
    act(() => {
      root.render(React.createElement(Wrapper));
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    assert.equal(value.incoming.pending.count, 1);

    act(() => {
      setFilters({ date_from: '2024-02-01', date_to: '2024-02-29' });
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    assert.equal(value.incoming.pending.count, 2);

    root.unmount();
    assert.deepEqual(seenParams, [
      'pending:2024-01-01:2024-01-31',
      'pending:2024-02-01:2024-02-29',
    ]);
  });

  test('socket notifications update counts within 1 second', async (t) => {
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

    let currentCount = 0;
    global.fetch = async (url) => {
      const u = new URL(url, 'http://example.com');
      if (u.pathname === '/api/pending_request') {
        return { ok: true, json: async () => ({ rows: [], total: currentCount }) };
      }
      if (u.pathname === '/api/pending_request/outgoing') {
        return { ok: true, json: async () => ({ rows: [], total: 0 }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const socket = createMockSocket();
    const { default: useRequestNotificationCounts } = await t.mock.import(
      '../../src/erp.mgt.mn/hooks/useRequestNotificationCounts.js',
      {
        '../utils/socket.js': {
          connectSocket: () => socket,
          disconnectSocket: () => {},
        },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { requestPollingEnabled: false } }),
        },
      },
    );

    const { value, unmount } = renderHook(() =>
      useRequestNotificationCounts(5, undefined, 'u1'),
    );
    await act(async () => {
      await Promise.resolve();
    });

    currentCount = 3;
    const start = Date.now();
    act(() => {
      socket.emit('notification:new', { kind: 'request' });
    });

    const elapsed = await waitForCondition(
      () => value.incoming.pending.count === 3,
      1000,
    );
    assert.ok(elapsed <= 1000, `notification applied in ${elapsed}ms`);
    assert.ok(Date.now() - start <= 1000);

    unmount();
  });

  test('polling resumes after socket disconnect delay', async (t) => {
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

    let fetchCount = 0;
    global.fetch = async (url) => {
      const u = new URL(url, 'http://example.com');
      if (u.pathname === '/api/pending_request') {
        fetchCount += 1;
        return { ok: true, json: async () => ({ rows: [], total: fetchCount }) };
      }
      if (u.pathname === '/api/pending_request/outgoing') {
        return { ok: true, json: async () => ({ rows: [], total: 0 }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const socket = createMockSocket();
    const { PollingProvider } = await t.mock.import(
      '../../src/erp.mgt.mn/context/PollingContext.jsx',
      {
        '../utils/socket.js': {
          onSocketStatusChange: () => () => {},
        },
      },
    );
    const { default: useRequestNotificationCounts } = await t.mock.import(
      '../../src/erp.mgt.mn/hooks/useRequestNotificationCounts.js',
      {
        '../utils/socket.js': {
          connectSocket: () => socket,
          disconnectSocket: () => {},
        },
        '../hooks/useGeneralConfig.js': {
          default: () => ({
            general: {
              requestPollingEnabled: true,
              requestPollingIntervalSeconds: 1,
            },
          }),
        },
      },
    );

    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    const timeouts = new Map();
    const intervals = new Map();
    const timeoutCalls = [];
    let intervalTriggered = false;
    global.setTimeout = (fn, delay, ...args) => {
      timeoutCalls.push(delay);
      const id = originalSetTimeout(fn, 0, ...args);
      timeouts.set(id, true);
      return id;
    };
    global.clearTimeout = (id) => {
      timeouts.delete(id);
      return originalClearTimeout(id);
    };
    global.setInterval = (fn, delay, ...args) => {
      const id = originalSetTimeout(() => {
        intervalTriggered = true;
        fn(...args);
      }, 0);
      intervals.set(id, delay);
      return id;
    };
    global.clearInterval = (id) => {
      intervals.delete(id);
      return originalClearTimeout(id);
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    let value;
    function Wrapper() {
      value = useRequestNotificationCounts(5, undefined, 'u1');
      return null;
    }

    act(() => {
      root.render(
        React.createElement(PollingProvider, null, React.createElement(Wrapper)),
      );
    });

    act(() => {
      socket.emit('disconnect');
    });

    await act(async () => {
      await Promise.resolve();
    });

    await waitForCondition(() => intervalTriggered === true, 1000);
    assert.ok(timeoutCalls.some((delay) => delay >= 30000));
    assert.ok(value.incoming.pending.count >= 1);

    root.unmount();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });
}

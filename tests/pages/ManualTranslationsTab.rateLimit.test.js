import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('ManualTranslationsTab halts on rate limit and shows one toast', { skip: true }, () => {});
  test(
    'ManualTranslationsTab backs off API reloads after hitting rate limit',
    { skip: true },
    () => {},
  );
} else {
  test('ManualTranslationsTab halts on rate limit and shows one toast', async () => {
    const toasts = [];
    globalThis.window = {
      dispatchEvent: (ev) => {
        if (ev.type === 'toast') toasts.push(ev.detail);
      },
      addEventListener: () => {},
      location: { hash: '' },
    };
    globalThis.CustomEvent = function (type, opts) {
      return { type, ...opts };
    };

    const states = [];
    let completeHandler;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        let value = initial;
        if (idx === 0) value = ['en', 'mn'];
        if (idx === 1) {
          value = [
            { key: 'k1', type: 'locale', values: { en: 'Hello', mn: '' } },
            { key: 'k2', type: 'locale', values: { en: 'World', mn: '' } },
          ];
        }
        states.push(value);
        return [
          value,
          (v) => {
            states[idx] = typeof v === 'function' ? v(states[idx]) : v;
          },
        ];
      },
      useEffect() {},
      useContext() {
        return { t: (_k, d) => d };
      },
      useRef(initial) {
        return { current: initial };
      },
      useCallback(fn) {
        return fn;
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button' && text.includes('Complete translations')) {
          completeHandler = props.onClick;
        }
        return null;
      },
    };

    const translateMock = mock.fn(async () => {
      const err = new Error('rate limited');
      err.rateLimited = true;
      throw err;
    });

    const { default: ManualTranslationsTab } = await mock.import(
      '../../src/erp.mgt.mn/pages/ManualTranslationsTab.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          useRef: reactMock.useRef,
          useCallback: reactMock.useCallback,
          createElement: reactMock.createElement,
        },
        '../context/I18nContext.jsx': { default: {} },
        '../utils/translateWithCache.js': { default: translateMock },
      },
    );

    reactMock.createElement(ManualTranslationsTab, {});

    await completeHandler();

    assert.equal(translateMock.mock.callCount(), 1);
    assert.equal(toasts.length, 1);
  });

  test('ManualTranslationsTab backs off API reloads after hitting rate limit', async () => {
    const toasts = [];
    const fetchCalls = [];
    const scheduledTimeouts = [];
    const originalFetch = global.fetch;
    const originalWindow = global.window;
    const originalCustomEvent = global.CustomEvent;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;

    const translateMock = mock.fn(async () => ({ text: 'OK', needsRetry: false }));

    global.fetch = mock.fn(async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url === '/api/manual_translations') {
        return { status: 429, ok: false, json: async () => ({}) };
      }
      if (url === '/api/manual_translations/bulk') {
        return { status: 204, ok: true, json: async () => ({}) };
      }
      return { status: 404, ok: false, json: async () => ({}) };
    });

    global.window = {
      dispatchEvent: (ev) => {
        if (ev.type === 'toast') toasts.push(ev.detail);
      },
      addEventListener: () => {},
      location: { hash: '' },
    };
    global.CustomEvent = function (type, opts) {
      return { type, ...opts };
    };

    global.setTimeout = (fn, delay, ...args) => {
      if (delay === 200) {
        fn(...args);
        return { immediate: true, delay };
      }
      const handle = { fn, delay, args };
      scheduledTimeouts.push(handle);
      return handle;
    };
    global.clearTimeout = (handle) => {
      const idx = scheduledTimeouts.indexOf(handle);
      if (idx >= 0) scheduledTimeouts.splice(idx, 1);
    };

    const states = [];
    let completeHandler;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        let value = initial;
        if (idx === 0) value = ['en', 'mn'];
        if (idx === 1) {
          value = [{ key: 'k1', type: 'locale', values: { en: 'Hello', mn: '' } }];
        }
        states.push(value);
        return [
          value,
          (v) => {
            states[idx] = typeof v === 'function' ? v(states[idx]) : v;
          },
        ];
      },
      useEffect(effect) {
        effect();
      },
      useContext() {
        return { t: (_k, d) => d };
      },
      useRef(initial) {
        return { current: initial };
      },
      useCallback(fn) {
        return fn;
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button' && text.includes('Complete translations')) {
          completeHandler = props.onClick;
        }
        return null;
      },
    };

    try {
      const { default: ManualTranslationsTab } = await mock.import(
        '../../src/erp.mgt.mn/pages/ManualTranslationsTab.jsx',
        {
          react: {
            default: reactMock,
            useState: reactMock.useState,
            useEffect: reactMock.useEffect,
            useContext: reactMock.useContext,
            useRef: reactMock.useRef,
            useCallback: reactMock.useCallback,
            createElement: reactMock.createElement,
          },
          '../context/I18nContext.jsx': { default: {} },
          '../context/ToastContext.jsx': {
            useToast: () => ({ addToast: () => {} }),
          },
          '../utils/translateWithCache.js': { default: translateMock },
        },
      );

      reactMock.createElement(ManualTranslationsTab, {});

      await completeHandler();

      const manualFetches = fetchCalls.filter((c) => c.url === '/api/manual_translations');
      const bulkFetches = fetchCalls.filter((c) => c.url === '/api/manual_translations/bulk');

      assert.equal(manualFetches.length, 1, 'should only fetch manual translations once');
      assert.equal(bulkFetches.length, 1, 'should post translated batch once');
      assert.equal(scheduledTimeouts.length, 1, 'should schedule a single retry');
      assert.equal(toasts.length, 1, 'should only show one rate limit toast');
      assert.equal(translateMock.mock.callCount(), 1, 'translates a single missing value');
    } finally {
      global.fetch = originalFetch;
      if (originalWindow === undefined) delete global.window;
      else global.window = originalWindow;
      if (originalCustomEvent === undefined) delete global.CustomEvent;
      else global.CustomEvent = originalCustomEvent;
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });
}

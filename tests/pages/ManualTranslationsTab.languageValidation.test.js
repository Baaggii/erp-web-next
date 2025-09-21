import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('validateBaseLanguages identifies swapped English/Mongolian values', { skip: true }, () => {});
  test(
    'ManualTranslationsTab completeAll warns about mismatched base languages',
    { skip: true },
    () => {},
  );
  test(
    'ManualTranslationsTab completeAll continues when base languages are valid',
    { skip: true },
    () => {},
  );
} else {
  test('validateBaseLanguages identifies swapped English/Mongolian values', async () => {
    const { validateBaseLanguages } = await mock.import(
      '../../src/erp.mgt.mn/pages/ManualTranslationsTab.jsx',
      {
        react: {
          default: {},
          useState: () => [null, () => {}],
          useEffect: () => {},
          useContext: () => ({ t: (_k, d) => d }),
          useRef: () => ({ current: null }),
          useCallback: (fn) => fn,
          createElement: () => null,
        },
        '../context/I18nContext.jsx': { default: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../utils/translateWithCache.js': { default: async () => ({ text: '', needsRetry: false }) },
      },
    );

    const result = validateBaseLanguages([
      { key: 'greeting', values: { en: 'Сайн байна уу', mn: 'Hello there' } },
    ]);

    assert.equal(result.invalid.length, 1);
    const issue = result.invalid[0];
    assert.equal(issue.key, 'greeting');
    assert(issue.issues.includes('englishLooksMongolian'));
    assert(issue.issues.includes('mongolianLooksEnglish'));
    assert(issue.issues.includes('baseFieldsSwapped'));
  });

  test('ManualTranslationsTab completeAll warns about mismatched base languages', async () => {
    const toasts = [];
    const addToast = (message, type) => {
      toasts.push({ message, type });
    };
    const translateMock = mock.fn(async () => ({ text: '', needsRetry: true }));
    const states = [];
    let completeHandler;
    const originalFetch = global.fetch;
    try {
      global.fetch = mock.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
      const reactMock = {
        useState(initial) {
          const idx = states.length;
          let value = initial;
          if (idx === 0) value = ['en', 'mn'];
          if (idx === 1) {
            value = [
              {
                key: 'swap',
                type: 'locale',
                values: { en: 'Сайн байна уу', mn: 'Сайн байна уу' },
              },
            ];
          }
          states.push(value);
          return [
            value,
            (next) => {
              states[idx] = typeof next === 'function' ? next(states[idx]) : next;
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
          '../context/ToastContext.jsx': { useToast: () => ({ addToast }) },
          '../utils/translateWithCache.js': { default: translateMock },
        },
      );

      reactMock.createElement(ManualTranslationsTab, {});

      await completeHandler();

      assert.equal(translateMock.mock.callCount(), 1);
      assert.equal(toasts.length, 1);
      assert.equal(toasts[0].type, 'error');
      assert.match(toasts[0].message, /English\/Mongolian/i);
      assert.equal(global.fetch.mock.callCount(), 0);
    } finally {
      if (originalFetch === undefined) delete global.fetch;
      else global.fetch = originalFetch;
    }
  });

  test(
    'ManualTranslationsTab completeAll auto-corrects swapped base languages',
    async () => {
      const translateMock = mock.fn(async (lang) => {
        if (lang === 'de') return { text: 'Hallo', needsRetry: false };
        if (lang === 'en') return { text: 'Hello', needsRetry: false };
        if (lang === 'mn') return { text: 'Сайн байна уу', needsRetry: false };
        return { text: '', needsRetry: false };
      });
      const toasts = [];
      const addToast = (message, type) => {
        toasts.push({ message, type });
      };
      const originalFetch = global.fetch;
      const originalWindow = global.window;
      const originalCustomEvent = global.CustomEvent;
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      try {
        global.fetch = mock.fn(async (url) => {
          if (url === '/api/manual_translations/bulk') {
            return { status: 204, ok: true, json: async () => ({}) };
          }
          return { status: 200, ok: true, json: async () => ({}) };
        });
        global.window = {
          dispatchEvent: () => {},
          addEventListener: () => {},
          location: { hash: '' },
        };
        global.CustomEvent = function (type, detail) {
          return { type, ...detail };
        };
        global.setTimeout = (fn, delay, ...args) => {
          if (delay === 200) {
            fn(...args);
            return { immediate: true };
          }
          return originalSetTimeout(fn, delay, ...args);
        };
        global.clearTimeout = (handle) => {
          if (!handle?.immediate) originalClearTimeout(handle);
        };
        const states = [];
        let completeHandler;
        const reactMock = {
          useState(initial) {
            const idx = states.length;
            let value = initial;
            if (idx === 0) value = ['en', 'mn', 'de'];
            if (idx === 1) {
              value = [
                {
                  key: 'swap',
                  type: 'locale',
                  module: 'module',
                  context: 'ctx',
                  values: { en: 'Сайн байна уу', mn: 'Hello', de: '' },
                },
              ];
            }
            states.push(value);
            return [
              value,
              (next) => {
                states[idx] = typeof next === 'function' ? next(states[idx]) : next;
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
            '../context/ToastContext.jsx': { useToast: () => ({ addToast }) },
            '../utils/translateWithCache.js': { default: translateMock },
          },
        );

        reactMock.createElement(ManualTranslationsTab, {});
        await completeHandler();

        assert.equal(toasts.filter((t) => t.type === 'error').length, 0);
        assert.equal(translateMock.mock.callCount(), 1);
        const bulkCall = global.fetch.mock.calls.find(
          (call) => call.arguments[0] === '/api/manual_translations/bulk',
        );
        assert(bulkCall, 'bulk save call was not made');
        const payload = JSON.parse(bulkCall.arguments[1].body);
        assert.equal(payload.length, 1);
        assert.equal(payload[0].values.en, 'Hello');
        assert.equal(payload[0].values.mn, 'Сайн байна уу');
        assert.equal(payload[0].values.de, 'Hallo');
      } finally {
        global.fetch = originalFetch;
        if (originalWindow === undefined) delete global.window;
        else global.window = originalWindow;
        if (originalCustomEvent === undefined) delete global.CustomEvent;
        else global.CustomEvent = originalCustomEvent;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
      }
    },
  );

  test(
    'ManualTranslationsTab completeAll sanitizes swapped base languages when translation needs retry',
    async () => {
      const translateMock = mock.fn(async (lang) => {
        if (lang === 'mn') return { text: '', needsRetry: true };
        return { text: '', needsRetry: false };
      });
      const toasts = [];
      const addToast = (message, type) => {
        toasts.push({ message, type });
      };
      const originalFetch = global.fetch;
      const originalWindow = global.window;
      const originalCustomEvent = global.CustomEvent;
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      try {
        global.fetch = mock.fn(async (url) => {
          if (url === '/api/manual_translations/bulk') {
            return { status: 204, ok: true, json: async () => ({}) };
          }
          return { status: 200, ok: true, json: async () => ({}) };
        });
        const dispatchedEvents = [];
        global.window = {
          dispatchEvent: (event) => {
            dispatchedEvents.push(event);
          },
          addEventListener: () => {},
          location: { hash: '' },
        };
        global.CustomEvent = function (type, detail) {
          return { type, ...detail };
        };
        global.setTimeout = (fn, delay, ...args) => {
          if (delay === 200) {
            fn(...args);
            return { immediate: true };
          }
          return originalSetTimeout(fn, delay, ...args);
        };
        global.clearTimeout = (handle) => {
          if (!handle?.immediate) originalClearTimeout(handle);
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
                {
                  key: 'swap',
                  type: 'locale',
                  module: 'module',
                  context: 'ctx',
                  values: { en: 'Сайн байна уу', mn: 'Hello there' },
                },
              ];
            }
            states.push(value);
            return [
              value,
              (next) => {
                states[idx] = typeof next === 'function' ? next(states[idx]) : next;
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
            '../context/ToastContext.jsx': { useToast: () => ({ addToast }) },
            '../utils/translateWithCache.js': { default: translateMock },
          },
        );

        reactMock.createElement(ManualTranslationsTab, {});
        await completeHandler();

        assert.equal(toasts.filter((t) => t.type === 'error').length, 0);
        assert(
          toasts.some((t) => t.type === 'warning' && /manual review/i.test(t.message)),
          'warning toast for manual review was not shown',
        );
        assert(translateMock.mock.callCount() >= 2);
        const entryState = states[1][0];
        assert.equal(entryState.values.en, 'Hello there');
        assert.equal(entryState.values.mn, '');
        assert.equal(global.fetch.mock.callCount(), 0);
        assert(
          dispatchedEvents.some(
            (event) => event?.detail?.type === 'error' && /incomplete/i.test(event.detail.message),
          ),
          'incomplete toast event was not dispatched',
        );
      } finally {
        global.fetch = originalFetch;
        if (originalWindow === undefined) delete global.window;
        else global.window = originalWindow;
        if (originalCustomEvent === undefined) delete global.CustomEvent;
        else global.CustomEvent = originalCustomEvent;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
      }
    },
  );

  test(
    'ManualTranslationsTab completeAll sanitizes English base when translation needs retry',
    async () => {
      const translateMock = mock.fn(async (lang) => {
        if (lang === 'en') return { text: '', needsRetry: true };
        return { text: '', needsRetry: false };
      });
      const toasts = [];
      const addToast = (message, type) => {
        toasts.push({ message, type });
      };
      const originalFetch = global.fetch;
      const originalWindow = global.window;
      const originalCustomEvent = global.CustomEvent;
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      try {
        global.fetch = mock.fn(async (url) => {
          if (url === '/api/manual_translations/bulk') {
            return { status: 204, ok: true, json: async () => ({}) };
          }
          return { status: 200, ok: true, json: async () => ({}) };
        });
        const dispatchedEvents = [];
        global.window = {
          dispatchEvent: (event) => {
            dispatchedEvents.push(event);
          },
          addEventListener: () => {},
          location: { hash: '' },
        };
        global.CustomEvent = function (type, detail) {
          return { type, ...detail };
        };
        global.setTimeout = (fn, delay, ...args) => {
          if (delay === 200) {
            fn(...args);
            return { immediate: true };
          }
          return originalSetTimeout(fn, delay, ...args);
        };
        global.clearTimeout = (handle) => {
          if (!handle?.immediate) originalClearTimeout(handle);
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
                {
                  key: 'needs-en-fix',
                  type: 'locale',
                  module: 'module',
                  context: 'ctx',
                  values: { en: 'Сайн байна уу', mn: 'Сайн байна уу' },
                },
              ];
            }
            states.push(value);
            return [
              value,
              (next) => {
                states[idx] = typeof next === 'function' ? next(states[idx]) : next;
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
            '../context/ToastContext.jsx': { useToast: () => ({ addToast }) },
            '../utils/translateWithCache.js': { default: translateMock },
          },
        );

        reactMock.createElement(ManualTranslationsTab, {});
        await completeHandler();

        assert.equal(toasts.filter((t) => t.type === 'error').length, 0);
        assert(
          toasts.some((t) => t.type === 'warning' && /manual review/i.test(t.message)),
          'warning toast for manual review was not shown',
        );
        assert(translateMock.mock.callCount() >= 1);
        const entryState = states[1][0];
        assert.equal(entryState.values.en, '');
        assert.equal(entryState.values.mn, 'Сайн байна уу');
        assert.equal(global.fetch.mock.callCount(), 0);
        assert(
          dispatchedEvents.some(
            (event) =>
              event?.detail?.type === 'error' && /incomplete/i.test(event.detail.message),
          ),
          'incomplete toast event was not dispatched',
        );
      } finally {
        global.fetch = originalFetch;
        if (originalWindow === undefined) delete global.window;
        else global.window = originalWindow;
        if (originalCustomEvent === undefined) delete global.CustomEvent;
        else global.CustomEvent = originalCustomEvent;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
      }
    },
  );

  test('ManualTranslationsTab completeAll continues when base languages are valid', async () => {
    const translateMock = mock.fn(async () => ({ text: 'Hallo', needsRetry: false }));
    const toasts = [];
    const addToast = (message, type) => {
      toasts.push({ message, type });
    };
    const originalFetch = global.fetch;
    const originalWindow = global.window;
    const originalCustomEvent = global.CustomEvent;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    try {
      global.fetch = mock.fn(async (url) => {
        if (url === '/api/manual_translations/bulk') {
          return { status: 204, ok: true, json: async () => ({}) };
        }
        return { status: 200, ok: true, json: async () => ({}) };
      });
      global.window = {
        dispatchEvent: () => {},
        addEventListener: () => {},
        location: { hash: '' },
      };
      global.CustomEvent = function (type, detail) {
        return { type, ...detail };
      };
      global.setTimeout = (fn, delay, ...args) => {
        if (delay === 200) {
          fn(...args);
          return { immediate: true };
        }
        return originalSetTimeout(fn, delay, ...args);
      };
      global.clearTimeout = (handle) => {
        if (!handle?.immediate) originalClearTimeout(handle);
      };
      const states = [];
      let completeHandler;
      const reactMock = {
        useState(initial) {
          const idx = states.length;
          let value = initial;
          if (idx === 0) value = ['en', 'mn', 'de'];
          if (idx === 1) {
            value = [
              {
                key: 'greeting',
                type: 'locale',
                values: { en: 'Hello', mn: 'Сайн байна уу', de: '' },
              },
            ];
          }
          states.push(value);
          return [
            value,
            (next) => {
              states[idx] = typeof next === 'function' ? next(states[idx]) : next;
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
          '../context/ToastContext.jsx': { useToast: () => ({ addToast }) },
          '../utils/translateWithCache.js': { default: translateMock },
        },
      );

      reactMock.createElement(ManualTranslationsTab, {});
      await completeHandler();

      assert.equal(translateMock.mock.callCount(), 1);
      assert.equal(toasts.filter((t) => t.type === 'error').length, 0);
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


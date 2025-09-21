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
    const translateMock = mock.fn(async () => ({ text: 'OK', needsRetry: false }));
    const states = [];
    let completeHandler;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        let value = initial;
        if (idx === 0) value = ['en', 'mn'];
        if (idx === 1) {
          value = [
            { key: 'swap', type: 'locale', values: { en: 'Сайн байна уу', mn: 'Hello' } },
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

    assert.equal(translateMock.mock.callCount(), 0);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, 'error');
    assert.match(toasts[0].message, /English\/Mongolian/i);
  });

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


import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

async function setupCompletionScenario({
  entryValues,
  translateMock,
  languages = ['en', 'mn'],
}) {
  const fetchCalls = [];
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  const originalCustomEvent = global.CustomEvent;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  global.fetch = mock.fn(async (url, options = {}) => {
    fetchCalls.push({ url, options });
    if (url === '/api/manual_translations/bulk') {
      return { status: 204, ok: true, json: async () => ({}) };
    }
    if (url === '/api/manual_translations') {
      return {
        status: 200,
        ok: true,
        json: async () => ({ languages, entries: [] }),
      };
    }
    return { status: 200, ok: true, json: async () => ({}) };
  });

  global.window = {
    dispatchEvent: () => {},
    addEventListener: () => {},
    location: { hash: '' },
  };
  global.CustomEvent = function (type, opts) {
    return { type, ...opts };
  };

  global.setTimeout = (fn, delay, ...args) => {
    if (delay === 200) {
      fn(...args);
      return { immediate: true };
    }
    return originalSetTimeout ? originalSetTimeout(fn, delay, ...args) : 0;
  };
  global.clearTimeout = (handle) => {
    if (handle && handle.immediate) return;
    if (originalClearTimeout) {
      originalClearTimeout(handle);
    }
  };

  const states = [];
  let completeHandler;
  const reactMock = {
    useState(initial) {
      const idx = states.length;
      let value = initial;
      if (idx === 0) value = [...languages];
      if (idx === 1) {
        value = [
          {
            key: 'greeting',
            type: 'locale',
            module: '',
            context: '',
            values: { ...entryValues },
          },
        ];
      }
      states.push(value);
      return [
        states[idx],
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

  const imports = await mock.import(
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

  reactMock.createElement(imports.default, {});

  return {
    async complete() {
      await completeHandler();
    },
    fetchCalls,
    cleanup() {
      global.fetch = originalFetch;
      global.window = originalWindow;
      global.CustomEvent = originalCustomEvent;
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    },
  };
}

if (typeof mock.import !== 'function') {
  test('ManualTranslationsTab normalizes Mongolian text before translating', { skip: true }, () => {});
  test('ManualTranslationsTab copies English text into en for translation', { skip: true }, () => {});
  test('ManualTranslationsTab swaps English and Mongolian values when reversed', { skip: true }, () => {});
} else {
  test('ManualTranslationsTab normalizes Mongolian text before translating', async () => {
    const translateMock = mock.fn(async () => ({ text: 'Hello there', needsRetry: false }));
    const scenario = await setupCompletionScenario({
      entryValues: { en: 'Сайн байна уу', mn: '' },
      translateMock,
    });

    try {
      await scenario.complete();

      assert.equal(translateMock.mock.callCount(), 1);
      const [targetLang, sourceText] = translateMock.mock.calls[0].arguments;
      assert.equal(targetLang, 'en');
      assert.equal(sourceText, 'Сайн байна уу');

      const bulkCall = scenario.fetchCalls.find((call) => call.url === '/api/manual_translations/bulk');
      assert.ok(bulkCall, 'expected bulk save call');
      const payload = JSON.parse(bulkCall.options.body);
      assert.equal(payload[0].values.mn, 'Сайн байна уу');
      assert.equal(payload[0].values.en, 'Hello there');
    } finally {
      scenario.cleanup();
    }
  });

  test('ManualTranslationsTab copies English text into en for translation', async () => {
    const translateMock = mock.fn(async () => ({ text: 'Сайн байна', needsRetry: false }));
    const scenario = await setupCompletionScenario({
      entryValues: { en: '', mn: 'Hello' },
      translateMock,
    });

    try {
      await scenario.complete();

      assert.equal(translateMock.mock.callCount(), 1);
      const [targetLang, sourceText] = translateMock.mock.calls[0].arguments;
      assert.equal(targetLang, 'mn');
      assert.equal(sourceText, 'Hello');

      const bulkCall = scenario.fetchCalls.find((call) => call.url === '/api/manual_translations/bulk');
      assert.ok(bulkCall, 'expected bulk save call');
      const payload = JSON.parse(bulkCall.options.body);
      assert.equal(payload[0].values.en, 'Hello');
      assert.equal(payload[0].values.mn, 'Сайн байна');
    } finally {
      scenario.cleanup();
    }
  });

  test('ManualTranslationsTab swaps English and Mongolian values when reversed', async () => {
    const translateMock = mock.fn(async () => ({ text: '', needsRetry: false }));
    const scenario = await setupCompletionScenario({
      entryValues: { en: 'Сайн байна', mn: 'Hello' },
      translateMock,
    });

    try {
      await scenario.complete();

      assert.equal(translateMock.mock.callCount(), 0);
      const bulkCall = scenario.fetchCalls.find((call) => call.url === '/api/manual_translations/bulk');
      assert.ok(bulkCall, 'expected bulk save call');
      const payload = JSON.parse(bulkCall.options.body);
      assert.equal(payload[0].values.en, 'Hello');
      assert.equal(payload[0].values.mn, 'Сайн байна');
    } finally {
      scenario.cleanup();
    }
  });

  test('ManualTranslationsTab clears Mongolian text from en when both fields contain Mongolian', async () => {
    const translateMock = mock.fn(async () => ({ text: 'Hello friend', needsRetry: false }));
    const scenario = await setupCompletionScenario({
      entryValues: { en: 'Сайн байна', mn: 'Сайн байна уу' },
      translateMock,
    });

    try {
      await scenario.complete();

      assert.equal(translateMock.mock.callCount(), 1);
      const [targetLang, sourceText] = translateMock.mock.calls[0].arguments;
      assert.equal(targetLang, 'en');
      assert.equal(sourceText, 'Сайн байна уу');

      const bulkCall = scenario.fetchCalls.find((call) => call.url === '/api/manual_translations/bulk');
      assert.ok(bulkCall, 'expected bulk save call');
      const payload = JSON.parse(bulkCall.options.body);
      assert.equal(payload[0].values.mn, 'Сайн байна уу');
      assert.equal(payload[0].values.en, 'Hello friend');
    } finally {
      scenario.cleanup();
    }
  });

  test('ManualTranslationsTab clears English text from mn when both fields contain English', async () => {
    const translateMock = mock.fn(async () => ({ text: 'Сайн байна уу', needsRetry: false }));
    const scenario = await setupCompletionScenario({
      entryValues: { en: 'Hello', mn: 'Hello there' },
      translateMock,
    });

    try {
      await scenario.complete();

      assert.equal(translateMock.mock.callCount(), 1);
      const [targetLang, sourceText] = translateMock.mock.calls[0].arguments;
      assert.equal(targetLang, 'mn');
      assert.equal(sourceText, 'Hello');

      const bulkCall = scenario.fetchCalls.find((call) => call.url === '/api/manual_translations/bulk');
      assert.ok(bulkCall, 'expected bulk save call');
      const payload = JSON.parse(bulkCall.options.body);
      assert.equal(payload[0].values.en, 'Hello');
      assert.equal(payload[0].values.mn, 'Сайн байна уу');
    } finally {
      scenario.cleanup();
    }
  });
}

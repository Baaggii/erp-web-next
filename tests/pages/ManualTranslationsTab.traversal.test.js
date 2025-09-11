import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('ManualTranslationsTab completes en/mn across all entries', { skip: true }, () => {});
  test('ManualTranslationsTab completes other languages across all entries', { skip: true }, () => {});
} else {
  test('ManualTranslationsTab completeEnMn traverses all entries and saves exported keys', async () => {
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => {
      fn();
      return 0;
    };

    const languages = ['en', 'mn'];
    const entries = Array.from({ length: 15 }, (_, i) => ({
      key: i >= 10 ? `exp${i}` : `k${i}`,
      type: 'locale',
      values: { en: '', mn: `mn${i}` },
    }));

    const translateMock = mock.fn(async () => 'ok');

    const fetchCalls = [];
    globalThis.fetch = mock.fn(async (url, opts = {}) => {
      if (url === '/api/manual_translations/bulk') {
        fetchCalls.push(JSON.parse(opts.body));
      }
      return { ok: true, status: 204 };
    });

    globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, location: { hash: '' } };
    globalThis.CustomEvent = function (type, opts) {
      return { type, ...opts };
    };

    const states = [];
    const setCalls = [];
    let enMnHandler;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        let value = initial;
        if (idx === 0) value = languages;
        if (idx === 1) value = entries;
        states[idx] = value;
        setCalls[idx] = [];
        const setter = (v) => {
          states[idx] = v;
          setCalls[idx].push(v);
        };
        return [value, setter];
      },
      useEffect() {},
      useContext() {
        return { t: (_k, d) => d };
      },
      useRef(initial) {
        return { current: initial };
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button' && text.includes('Complete en/mn translations')) {
          enMnHandler = props.onClick;
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
          createElement: reactMock.createElement,
        },
        '../context/I18nContext.jsx': { default: {} },
        '../utils/translateWithCache.js': { default: translateMock },
      },
    );

    reactMock.createElement(ManualTranslationsTab, {});

    await enMnHandler();

    assert.equal(translateMock.mock.callCount(), 15);
    assert.ok(setCalls[2].includes(2));
    assert.ok(setCalls[7].includes(14));
    assert.equal(fetchCalls.length, 2);
    const keys = fetchCalls.flat().map((e) => e.key);
    assert.ok(keys.includes('exp10') && keys.includes('exp14'));
    assert.ok(states[1].every((e) => e.values.en));

    globalThis.setTimeout = realSetTimeout;
  });

  test('ManualTranslationsTab completeOtherLanguages traverses all entries and saves exported keys', async () => {
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => {
      fn();
      return 0;
    };

    const languages = ['en', 'mn', 'fr'];
    const entries = Array.from({ length: 15 }, (_, i) => ({
      key: i >= 10 ? `exp${i}` : `k${i}`,
      type: 'locale',
      values: { en: `en${i}`, mn: '', fr: '' },
    }));

    const translateMock = mock.fn(async () => 'ok');

    const fetchCalls = [];
    globalThis.fetch = mock.fn(async (url, opts = {}) => {
      if (url === '/api/manual_translations/bulk') {
        fetchCalls.push(JSON.parse(opts.body));
      }
      return { ok: true, status: 204 };
    });

    globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, location: { hash: '' } };
    globalThis.CustomEvent = function (type, opts) {
      return { type, ...opts };
    };

    const states = [];
    const setCalls = [];
    let otherHandler;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        let value = initial;
        if (idx === 0) value = languages;
        if (idx === 1) value = entries;
        states[idx] = value;
        setCalls[idx] = [];
        const setter = (v) => {
          states[idx] = v;
          setCalls[idx].push(v);
        };
        return [value, setter];
      },
      useEffect() {},
      useContext() {
        return { t: (_k, d) => d };
      },
      useRef(initial) {
        return { current: initial };
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button' && text.includes('Complete other languages translations')) {
          otherHandler = props.onClick;
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
          createElement: reactMock.createElement,
        },
        '../context/I18nContext.jsx': { default: {} },
        '../utils/translateWithCache.js': { default: translateMock },
      },
    );

    reactMock.createElement(ManualTranslationsTab, {});

    await otherHandler();

    assert.equal(translateMock.mock.callCount(), 15);
    assert.ok(setCalls[2].includes(2));
    assert.ok(setCalls[7].includes(14));
    assert.equal(fetchCalls.length, 2);
    const keys = fetchCalls.flat().map((e) => e.key);
    assert.ok(keys.includes('exp10') && keys.includes('exp14'));
    assert.ok(states[1].every((e) => e.values.fr));

    globalThis.setTimeout = realSetTimeout;
  });
}


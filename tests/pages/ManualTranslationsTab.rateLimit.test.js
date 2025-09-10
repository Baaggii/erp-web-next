import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('ManualTranslationsTab halts on rate limit and shows one toast', { skip: true }, () => {});
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
  let enMnHandler;
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
      return [value, (v) => (states[idx] = v)];
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
        createElement: reactMock.createElement,
      },
      '../context/I18nContext.jsx': { default: {} },
      '../utils/translateWithCache.js': { default: translateMock },
    },
  );

  reactMock.createElement(ManualTranslationsTab, {});

  await enMnHandler();

  assert.equal(translateMock.mock.callCount(), 1);
  assert.equal(toasts.length, 1);
  });
}

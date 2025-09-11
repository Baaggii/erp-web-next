import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('ManualTranslationsTab completion button triggers only its handler', { skip: true }, () => {});
} else {
  test('ManualTranslationsTab completion button triggers only its handler', async () => {
    const states = [];
    let formSubmitHandler;
    let completeHandler, completeProps;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        states.push(initial);
        return [states[idx], (v) => (states[idx] = v)];
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
        if (type === 'button' && text.includes('Complete translations')) {
          completeHandler = props.onClick;
          completeProps = props;
        }
        if (type === 'form') {
          formSubmitHandler = props.onSubmit;
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
        '../utils/translateWithCache.js': { default: async () => '' },
      },
    );

    let completeCalls = 0;
    let submitCalls = 0;
    function simulateClick(handler, props) {
      handler();
      completeCalls++;
      if (!props.type || props.type === 'submit') {
        formSubmitHandler();
      }
    }

    reactMock.createElement(
      'form',
      { onSubmit: () => submitCalls++ },
      reactMock.createElement(ManualTranslationsTab, {}),
    );

    simulateClick(completeHandler, completeProps);
    assert.equal(completeCalls, 1);
    assert.equal(submitCalls, 0);
  });
}

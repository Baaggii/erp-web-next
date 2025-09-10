import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('ManualTranslationsTab completion buttons trigger only their handlers', { skip: true }, () => {});
} else {
  test('ManualTranslationsTab completion buttons trigger only their handlers', async () => {
    const states = [];
    let formSubmitHandler;
    let addRowHandler, addRowProps;
    let enMnHandler, enMnProps;
    let otherHandler, otherProps;
    let cancelHandler, cancelProps;
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
        if (type === 'button') {
          if (text.includes('Add Row')) {
            addRowHandler = props.onClick;
            addRowProps = props;
          }
          if (text.includes('Complete en/mn translations')) {
            enMnHandler = props.onClick;
            enMnProps = props;
          }
          if (text.includes('Complete other languages translations')) {
            otherHandler = props.onClick;
            otherProps = props;
          }
          if (text.includes('Cancel')) {
            cancelHandler = props.onClick;
            cancelProps = props;
          }
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

    // Scenario 1: form submits to en/mn handler
    let enMnCalls = 0;
    let otherCalls = 0;
    function simulateClick(handler, props, which) {
      handler();
      if (!props.type || props.type === 'submit') {
        formSubmitHandler();
      }
      if (which === 'enMn') enMnCalls++;
      if (which === 'other') otherCalls++;
    }

    reactMock.createElement(
      'form',
      { onSubmit: () => enMnCalls++ },
      reactMock.createElement(ManualTranslationsTab, {}),
    );

    simulateClick(otherHandler, otherProps, 'other');
    assert.equal(otherCalls, 1);
    assert.equal(enMnCalls, 0);

    // Scenario 2: form submits to other languages handler
    enMnCalls = 0;
    otherCalls = 0;
    reactMock.createElement(
      'form',
      { onSubmit: () => otherCalls++ },
      reactMock.createElement(ManualTranslationsTab, {}),
    );

    simulateClick(enMnHandler, enMnProps, 'enMn');
    assert.equal(enMnCalls, 1);
    assert.equal(otherCalls, 0);
  });
}

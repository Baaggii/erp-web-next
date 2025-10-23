import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('AllowedReportsConfig refreshes modules after save', { skip: true }, () => {});
} else {
  test('AllowedReportsConfig refreshes modules after save', async () => {
    const states = [];
    let saveHandler;

    function flatten(children) {
      const out = [];
      const stack = [...children];
      while (stack.length) {
        const value = stack.shift();
        if (Array.isArray(value)) {
          stack.unshift(...value);
        } else if (value !== null && value !== undefined) {
          out.push(value);
        }
      }
      return out;
    }

    const reactMock = {
      useState(initial) {
        const idx = states.length;
        states.push(initial);
        return [states[idx], (value) => (states[idx] = value)];
      },
      useEffect() {},
      useContext() {
        return {};
      },
      useMemo(factory) {
        return factory();
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        if (type === 'button') {
          const text = flatten(children)
            .filter((child) => typeof child === 'string')
            .join('');
          if (text.includes('Save')) {
            saveHandler = props.onClick;
          }
        }
        return null;
      },
    };

    const addToastCalls = [];
    const refreshCalls = [];
    const fetchCalls = [];

    global.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return { ok: true, json: async () => ({}) };
    };

    const { default: AllowedReportsConfig } = await mock.import(
      '../../src/erp.mgt.mn/pages/AllowedReportsConfig.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          useMemo: reactMock.useMemo,
          createElement: reactMock.createElement,
        },
        '../context/ToastContext.jsx': {
          useToast: () => ({
            addToast: (msg, type) => addToastCalls.push({ msg, type }),
          }),
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../hooks/useModules.js': {
          refreshModules: () => refreshCalls.push('called'),
        },
        '../hooks/useHeaderMappings.js': {
          default: () => ({}),
        },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: {} }),
        },
      },
    );

    AllowedReportsConfig();

    states[1] = 'proc1';
    states[2] = ['1'];
    states[3] = ['2'];
    states[4] = ['3'];

    await saveHandler();

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, '/api/report_access');
    assert.deepEqual(refreshCalls, ['called']);
    assert.deepEqual(addToastCalls, [{ msg: 'Saved', type: 'success' }]);

    delete global.fetch;
  });
}

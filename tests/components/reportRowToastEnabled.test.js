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

if (!haveReact) {
  test('ReportTable respects reportRowToastEnabled', { skip: true }, () => {});
} else {
  test('row toast dispatched when enabled', async (t) => {
    const dispatched = [];
    global.window.dispatchEvent = (e) => dispatched.push(e);

    const { default: ReportTable } = await t.mock.import(
      '../../src/erp.mgt.mn/components/ReportTable.jsx',
      {
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { reportRowToastEnabled: true } }),
        },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../context/AuthContext.jsx': { AuthContext: React.createContext({}) },
        './Modal.jsx': { default: () => null },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        React.createElement(ReportTable, {
          procedure: 'proc1',
          params: {},
          rows: [],
        }),
      );
    });

    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].detail.message, 'Selected procedure: proc1');
    root.unmount();
  });

  test('row toast suppressed when disabled', async (t) => {
    const dispatched = [];
    global.window.dispatchEvent = (e) => dispatched.push(e);

    const { default: ReportTable } = await t.mock.import(
      '../../src/erp.mgt.mn/components/ReportTable.jsx',
      {
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { reportRowToastEnabled: false } }),
        },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../context/AuthContext.jsx': { AuthContext: React.createContext({}) },
        './Modal.jsx': { default: () => null },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        React.createElement(ReportTable, {
          procedure: 'proc1',
          params: {},
          rows: [],
        }),
      );
    });

    assert.equal(dispatched.length, 0);
    root.unmount();
  });
}


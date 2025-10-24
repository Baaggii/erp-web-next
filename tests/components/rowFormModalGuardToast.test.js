import test from 'node:test';
import assert from 'node:assert/strict';

let React;
let act;
let createRoot;
let haveReact = true;
let JSDOM;

try {
  ({ default: React } = await import('react'));
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
  ({ JSDOM } = await import('jsdom'));
} catch {
  haveReact = false;
}

if (!haveReact) {
  test('RowFormModal guard toast edit notification', { skip: true }, () => {});
} else {
  test('RowFormModal emits auto-reset guard toast on edit attempts', async (t) => {
    const prevWindow = global.window;
    const prevDocument = global.document;
    const prevHTMLElement = global.HTMLElement;
    const prevCustomEvent = global.CustomEvent;

    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.CustomEvent = dom.window.CustomEvent;

    const toasts = [];
    const toastHandler = (event) => {
      toasts.push(event.detail);
    };
    window.addEventListener('toast', toastHandler);

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => null },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (props) => React.createElement('div', props, props.children) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { posGuardToastEnabled: true } }),
        },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ user: {}, company: 1, branch: 1, department: 1, userSettings: {} }),
        },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/callProcedure.js': { default: () => {} },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['SessionId'],
            row: { SessionId: 'ABC' },
            fieldTypeMap: { SessionId: 'text' },
            labels: { SessionId: 'Session ID' },
            disabledFields: [],
            disabledFieldReasons: { SessionId: ['sessionFieldAutoReset'] },
          }),
        );
      });

      const input = container.querySelector('input');
      assert.ok(input, 'expected to find input for SessionId');

      await act(async () => {
        input.value = 'XYZ';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
      });

      const lastToast = toasts[toasts.length - 1];
      assert.ok(lastToast, 'expected a toast to be emitted');
      assert.equal(lastToast.type, 'info');
      assert.match(lastToast.message, /SessionId/);
      assert.match(lastToast.message, /edit resets automatically/i);
      assert.match(lastToast.message, /resets automatically to match the active POS session/i);
    } finally {
      window.removeEventListener('toast', toastHandler);
      root.unmount();
      container.remove();
      global.window = prevWindow;
      global.document = prevDocument;
      if (prevHTMLElement) {
        global.HTMLElement = prevHTMLElement;
      } else {
        delete global.HTMLElement;
      }
      if (prevCustomEvent) {
        global.CustomEvent = prevCustomEvent;
      } else {
        delete global.CustomEvent;
      }
    }
  });

  test('RowFormModal edit toast explains computed guard enforcement', async (t) => {
    const prevWindow = global.window;
    const prevDocument = global.document;
    const prevHTMLElement = global.HTMLElement;
    const prevCustomEvent = global.CustomEvent;

    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.CustomEvent = dom.window.CustomEvent;

    const toasts = [];
    const toastHandler = (event) => {
      toasts.push(event.detail);
    };
    window.addEventListener('toast', toastHandler);

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => null },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (props) => React.createElement('div', props, props.children) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { posGuardToastEnabled: true } }),
        },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ user: {}, company: 1, branch: 1, department: 1, userSettings: {} }),
        },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/callProcedure.js': { default: () => {} },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['Total'],
            row: { Total: '100.00' },
            fieldTypeMap: { Total: 'number' },
            labels: { Total: 'Total' },
            disabledFields: [],
            disabledFieldReasons: { Total: ['posFormula'] },
          }),
        );
      });

      const input = container.querySelector('input');
      assert.ok(input, 'expected to find input for Total');

      await act(async () => {
        input.value = '200.00';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
      });

      const lastToast = toasts[toasts.length - 1];
      assert.ok(lastToast, 'expected a toast for computed guard edit');
      assert.equal(lastToast.type, 'info');
      assert.match(lastToast.message, /Total/);
      assert.match(lastToast.message, /calculated values prevail/i);
      assert.match(lastToast.message, /preserveManualChangesAfterRecalc/i);
    } finally {
      window.removeEventListener('toast', toastHandler);
      root.unmount();
      container.remove();
      global.window = prevWindow;
      global.document = prevDocument;
      if (prevHTMLElement) {
        global.HTMLElement = prevHTMLElement;
      } else {
        delete global.HTMLElement;
      }
      if (prevCustomEvent) {
        global.CustomEvent = prevCustomEvent;
      } else {
        delete global.CustomEvent;
      }
    }
  });

  test('RowFormModal edit toast reports success when no guards apply', async (t) => {
    const prevWindow = global.window;
    const prevDocument = global.document;
    const prevHTMLElement = global.HTMLElement;
    const prevCustomEvent = global.CustomEvent;

    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.CustomEvent = dom.window.CustomEvent;

    const toasts = [];
    const toastHandler = (event) => {
      toasts.push(event.detail);
    };
    window.addEventListener('toast', toastHandler);

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => null },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (props) => React.createElement('div', props, props.children) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { posGuardToastEnabled: true } }),
        },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ user: {}, company: 1, branch: 1, department: 1, userSettings: {} }),
        },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/callProcedure.js': { default: () => {} },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['Description'],
            row: { Description: 'Initial' },
            fieldTypeMap: { Description: 'text' },
            labels: { Description: 'Description' },
            disabledFields: [],
            disabledFieldReasons: {},
          }),
        );
      });

      const input = container.querySelector('input');
      assert.ok(input, 'expected to find input for Description');

      await act(async () => {
        input.value = 'Updated';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
      });

      const lastToast = toasts[toasts.length - 1];
      assert.ok(lastToast, 'expected a toast for unguarded edit');
      assert.equal(lastToast.type, 'info');
      assert.match(lastToast.message, /Description/);
      assert.match(lastToast.message, /edit saved/i);
    } finally {
      window.removeEventListener('toast', toastHandler);
      root.unmount();
      container.remove();
      global.window = prevWindow;
      global.document = prevDocument;
      if (prevHTMLElement) {
        global.HTMLElement = prevHTMLElement;
      } else {
        delete global.HTMLElement;
      }
      if (prevCustomEvent) {
        global.CustomEvent = prevCustomEvent;
      } else {
        delete global.CustomEvent;
      }
    }
  });
}

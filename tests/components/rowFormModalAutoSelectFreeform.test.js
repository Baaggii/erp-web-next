import test from 'node:test';
import assert from 'node:assert/strict';

if (!global.document) {
  global.document = { createElement: () => ({}) };
} else if (!global.document.createElement) {
  global.document.createElement = () => ({});
}

if (!global.window) {
  global.window = {};
}
if (!global.window.addEventListener) global.window.addEventListener = () => {};
if (!global.window.removeEventListener) global.window.removeEventListener = () => {};
if (!global.window.dispatchEvent) global.window.dispatchEvent = () => {};
if (!global.window.confirm) global.window.confirm = () => true;
if (!global.window.alert) global.window.alert = () => {};
if (!global.window.open)
  global.window.open = () => ({ document: { write: () => {}, close: () => {} }, focus: () => {}, print: () => {} });
if (!global.window.innerWidth) global.window.innerWidth = 1024;
if (!global.window.matchMedia)
  global.window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
if (!global.ResizeObserver)
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

let React;
let act;
let createRoot;
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
  test('RowFormModal allows unmatched auto-select values', { skip: true }, () => {});
} else {
  const baseProps = {
    visible: true,
    onCancel: () => {},
    onSubmit: () => {},
    onChange: () => {},
    onRowsChange: () => {},
    columns: ['status'],
    row: {},
    rows: [],
    relations: {},
    relationConfigs: {},
    relationData: {},
    fieldTypeMap: { status: 'varchar' },
    disabledFields: [],
    labels: { status: 'Status' },
    requiredFields: [],
    defaultValues: {},
    dateField: [],
    inline: false,
    useGrid: false,
    fitted: false,
    table: 'test',
    imagenameField: [],
    imageIdField: '',
    scope: 'forms',
    headerFields: [],
    mainFields: ['status'],
    footerFields: [],
    userIdFields: [],
    branchIdFields: [],
    departmentIdFields: [],
    companyIdFields: [],
    printEmpField: [],
    printCustField: [],
    totalAmountFields: [],
    totalCurrencyFields: [],
    procTriggers: {},
    columnCaseMap: { status: 'status' },
    viewSource: {},
    viewDisplays: {},
    viewColumns: {},
    loadView: () => {},
    autoFillSession: false,
    tableColumns: [],
  };

  test('RowFormModal allows unmatched auto-select values', async (t) => {
    let keyDownHandler = null;
    let observedValue = null;

    const AsyncSearchSelectMock = (props) => {
      observedValue = props.value;
      keyDownHandler = props.onKeyDown;
      if (props.inputRef) {
        props.inputRef({
          value: props.value ?? '',
          focus: () => {},
          select: () => {},
          style: {},
        });
      }
      return React.createElement('div', null);
    };

    const ModalMock = (props) => React.createElement('div', null, props.children);

    const mocks = {
      './AsyncSearchSelect.jsx': { default: AsyncSearchSelectMock },
      './Modal.jsx': { default: ModalMock },
      './InlineTransactionTable.jsx': { default: () => null },
      './RowDetailModal.jsx': { default: () => null },
      './TooltipWrapper.jsx': { default: ({ children }) => React.createElement(React.Fragment, null, children) },
      'react-i18next': { useTranslation: () => ({ t: (key, fallback) => fallback || key }) },
      '../context/AuthContext.jsx': { AuthContext: React.createContext({}) },
      '../utils/formatTimestamp.js': { default: () => '2024-01-01 00:00:00' },
      '../utils/normalizeDateInput.js': { default: (val) => val },
      '../utils/callProcedure.js': { default: async () => ({}) },
      '../utils/generatedColumns.js': {
        applyGeneratedColumnEvaluators: () => ({ changed: false }),
        createGeneratedColumnEvaluator: () => null,
      },
      '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
      '../utils/apiBase.js': { API_BASE: '' },
    };

    const origFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ demo: { idField: 'status', displayFields: ['name'] } }),
    });

    let root;
    try {
      const mod = await t.mock.import('../../src/erp.mgt.mn/components/RowFormModal.jsx', mocks);
      const RowFormModal = mod.default || mod;

      const container = document.createElement('div');
      root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(RowFormModal, baseProps));
      });

      // Allow fetch promise and subsequent state updates to settle.
      await act(async () => {
        await Promise.resolve();
      });

      assert.ok(typeof keyDownHandler === 'function', 'AsyncSearchSelect should provide onKeyDown');
      assert.equal(observedValue ?? '', '', 'Initial field value should be empty');

      await act(async () => {
        keyDownHandler({
          key: 'Enter',
          preventDefault: () => {},
          target: {
            value: 'Custom Value',
            focus: () => {},
            select: () => {},
          },
          lookupMatched: false,
        });
      });

      assert.equal(observedValue, 'Custom Value');
    } finally {
      if (root) root.unmount();
      global.fetch = origFetch;
    }
  });
}


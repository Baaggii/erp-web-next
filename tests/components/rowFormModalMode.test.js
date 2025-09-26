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
if (!global.window.open) global.window.open = () => ({ document: { write: () => {}, close: () => {} }, focus: () => {}, print: () => {} });
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

async function loadRowFormModal(t, handleModalProps) {
  const mocks = {
    './AsyncSearchSelect.jsx': { default: () => null },
    './Modal.jsx': {
      default: (props) => {
        handleModalProps(props);
        return null;
      },
    },
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
  const mod = await t.mock.import('../../src/erp.mgt.mn/components/RowFormModal.jsx', mocks);
  return mod.default || mod;
}

if (!haveReact) {
  test('RowFormModal shows add title when add mode flag set', { skip: true }, () => {});
  test('RowFormModal shows edit title when add mode flag false', { skip: true }, () => {});
} else {
  const baseProps = {
    visible: true,
    onCancel: () => {},
    onSubmit: () => {},
    onChange: () => {},
    onRowsChange: () => {},
    columns: ['name'],
    row: { name: 'Alpha' },
    rows: [],
    relations: {},
    relationConfigs: {},
    relationData: {},
    fieldTypeMap: { name: 'varchar' },
    disabledFields: [],
    labels: {},
    requiredFields: [],
    defaultValues: { name: 'Alpha' },
    dateField: [],
    inline: false,
    useGrid: false,
    fitted: false,
    table: 'test',
    imagenameField: [],
    imageIdField: '',
    scope: 'forms',
    headerFields: [],
    mainFields: ['name'],
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
    columnCaseMap: {},
    viewSource: {},
    viewDisplays: {},
    viewColumns: {},
    loadView: () => {},
    autoFillSession: false,
    tableColumns: [],
  };

  test('RowFormModal shows add title when add mode flag set', async (t) => {
    let lastModalProps = null;
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });
    let root;
    try {
      const RowFormModal = await loadRowFormModal(t, (props) => {
        lastModalProps = props;
      });

      const container = document.createElement('div');
      root = createRoot(container);
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            ...baseProps,
            isAddMode: true,
          }),
        );
      });

      assert.ok(lastModalProps);
      assert.equal(lastModalProps.title, 'Мөр нэмэх');
    } finally {
      if (root) root.unmount();
      global.fetch = origFetch;
    }
  });

  test('RowFormModal shows edit title when add mode flag false', async (t) => {
    let lastModalProps = null;
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });
    let root;
    try {
      const RowFormModal = await loadRowFormModal(t, (props) => {
        lastModalProps = props;
      });

      const container = document.createElement('div');
      root = createRoot(container);
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            ...baseProps,
            isAddMode: false,
          }),
        );
      });

      assert.ok(lastModalProps);
      assert.equal(lastModalProps.title, 'Мөр засах');
    } finally {
      if (root) root.unmount();
      global.fetch = origFetch;
    }
  });
}

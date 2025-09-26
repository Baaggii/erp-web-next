import test from 'node:test';
import assert from 'node:assert/strict';

if (!global.document) {
  global.document = { createElement: () => ({ style: {} }) };
}
if (!global.window) {
  global.window = {};
}
Object.assign(global.window, {
  addEventListener: () => {},
  removeEventListener: () => {},
  confirm: () => true,
});

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

const columns = [
  { name: 'id', key: 'PRI' },
  { name: 'name' },
  { name: 'description' },
  { name: 'status' },
  { name: 'relation_id' },
];

if (!haveReact) {
  test('TableManager skips editableFields restrictions when adding', { skip: true }, () => {});
} else {
  test('TableManager skips editableFields restrictions when adding', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.endsWith('/columns')) {
        return { ok: true, json: async () => columns };
      }
      if (url.endsWith('/relations')) {
        return { ok: true, json: async () => [] };
      }
      if (url.includes('/display_fields')) {
        return { ok: true, json: async () => ({ displayFields: [] }) };
      }
      if (url.includes('/tenant_tables/')) {
        return { ok: true, json: async () => ({ tenantKey: null }) };
      }
      return { ok: true, json: async () => ({ rows: [], count: 0 }) };
    };

    let rowFormDisabled;
    let inlineDisabled;

    const InlineTransactionTableMock = (props) => {
      inlineDisabled = props.disabledFields ? [...props.disabledFields] : [];
      return null;
    };

    const RowFormModalMock = (props) => {
      rowFormDisabled = props.disabledFields ? [...props.disabledFields] : [];
      return React.createElement(InlineTransactionTableMock, props);
    };

    let root;
    try {
      const { default: TableManager } = await t.mock.import(
        '../../src/erp.mgt.mn/components/TableManager.jsx',
        {
          '../context/AuthContext.jsx': {
            AuthContext: React.createContext({
              user: { empid: 77 },
              company: 9,
              branch: 3,
              department: 5,
            }),
          },
          '../context/ToastContext.jsx': {
            useToast: () => ({ addToast: () => {} }),
          },
          './RowFormModal.jsx': { default: RowFormModalMock },
          './InlineTransactionTable.jsx': { default: InlineTransactionTableMock },
          './CascadeDeleteModal.jsx': { default: () => null },
          './RowDetailModal.jsx': { default: () => null },
          './RowImageViewModal.jsx': { default: () => null },
          './RowImageUploadModal.jsx': { default: () => null },
          './ImageSearchModal.jsx': { default: () => null },
          './Modal.jsx': { default: () => null },
          './CustomDatePicker.jsx': { default: () => null },
          '../hooks/useGeneralConfig.js': { default: () => ({}) },
          '../utils/formatTimestamp.js': { default: () => '2024-01-01 00:00:00' },
          '../utils/buildImageName.js': { default: () => ({}) },
          '../utils/slugify.js': { default: () => '' },
          '../utils/apiBase.js': { API_BASE: '' },
          'react-i18next': {
            useTranslation: () => ({ t: (key, fallback) => fallback ?? key }),
          },
        },
      );

      const container = document.createElement('div');
      root = createRoot(container);
      const ref = React.createRef();

      await act(async () => {
        root.render(
          React.createElement(TableManager, {
            ref,
            table: 'test_table',
            buttonPerms: { 'New transaction': true },
            formConfig: {
              headerFields: ['name', 'status'],
              mainFields: ['description', 'relation_id'],
              defaultValues: { status: 'new' },
              editableFields: ['status'],
            },
            allConfigs: {},
          }),
        );
      });

      await act(async () => {
        await ref.current.openAdd();
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.deepEqual(rowFormDisabled, ['status']);
      assert.deepEqual(inlineDisabled, ['status']);
    } finally {
      if (root) {
        root.unmount();
      }
      global.fetch = origFetch;
    }
  });
}

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
if (!global.window.matchMedia) {
  global.window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
}

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
  test('TableManager keeps relation fields editable in add mode for non-transaction tables', { skip: true }, () => {});
} else {
  test('TableManager keeps relation fields editable in add mode for non-transaction tables', async (t) => {
    const disabledSnapshots = [];
    const inlineDisabledSnapshots = [];

    const InlineTransactionTableMock = (props) => {
      inlineDisabledSnapshots.push(props.disabledFields);
      return React.createElement('div', null, 'inline');
    };

    const RowFormModalMock = (props) => {
      disabledSnapshots.push(props.disabledFields);
      return React.createElement(InlineTransactionTableMock, props);
    };

    const origFetch = global.fetch;
    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/tables/items/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'id', key: 'PRI', type: 'int', extra: 'auto_increment' },
            { name: 'name', type: 'varchar' },
            { name: 'category_id', type: 'int' },
          ],
        };
      }
      if (url === '/api/tables/items/relations') {
        return {
          ok: true,
          json: async () => [
            {
              COLUMN_NAME: 'category_id',
              REFERENCED_TABLE_NAME: 'categories',
              REFERENCED_COLUMN_NAME: 'id',
            },
          ],
        };
      }
      if (url.startsWith('/api/display_fields?table=categories')) {
        return { ok: true, json: async () => ({ idField: 'id', displayFields: ['name'] }) };
      }
      if (url.startsWith('/api/tenant_tables/categories')) {
        return { ok: true, json: async () => ({ tenantKeys: [] }) };
      }
      if (url.startsWith('/api/tables/categories?')) {
        return {
          ok: true,
          json: async () => ({ rows: [{ id: 1, name: 'Category A' }], count: 1 }),
        };
      }
      if (url.startsWith('/api/tables/items?')) {
        return { ok: true, json: async () => ({ rows: [], count: 0 }) };
      }
      if (url.startsWith('/api/proc_triggers?table=items')) {
        return { ok: true, json: async () => ({}) };
      }
      if (url.startsWith('/api/display_fields')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const formConfig = {
      mainFields: ['id', 'name', 'category_id'],
      headerFields: [],
      footerFields: [],
      editableFields: ['name'],
      defaultValues: { status: 'active' },
      useGrid: true,
    };

    const { default: TableManager } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableManager.jsx',
      {
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({
            user: {},
            company: 1,
            branch: 1,
            department: 1,
            userSettings: {},
          }),
        },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: () => {} }),
        },
        './RowFormModal.jsx': { default: RowFormModalMock },
        './CascadeDeleteModal.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './RowImageViewModal.jsx': { default: () => null },
        './RowImageUploadModal.jsx': { default: () => null },
        './ImageSearchModal.jsx': { default: () => null },
        './Modal.jsx': { default: () => null },
        './CustomDatePicker.jsx': { default: () => null },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {}, forms: {} }) },
        '../utils/formatTimestamp.js': { default: () => '2024-01-01 00:00:00' },
        '../utils/buildImageName.js': { default: () => ({}) },
        '../utils/slugify.js': { default: (value) => String(value).toLowerCase() },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    const managerRef = React.createRef();

    try {
      await act(async () => {
        root.render(
          React.createElement(TableManager, {
            ref: managerRef,
            table: 'items',
            buttonPerms: { 'New transaction': true },
            formConfig,
            allConfigs: {},
          }),
        );
      });

      assert.ok(managerRef.current, 'expected TableManager ref to be set');

      await act(async () => {
        await managerRef.current.openAdd();
      });

      for (let i = 0; i < 20; i += 1) {
        if (disabledSnapshots.length > 0 && inlineDisabledSnapshots.length > 0) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      assert.ok(disabledSnapshots.length > 0, 'RowFormModal did not receive disabled fields');
      assert.ok(inlineDisabledSnapshots.length > 0, 'InlineTransactionTable did not receive disabled fields');

      const lastDisabled = disabledSnapshots[disabledSnapshots.length - 1] || [];
      const lastInlineDisabled = inlineDisabledSnapshots[inlineDisabledSnapshots.length - 1] || [];

      const lowerDisabled = new Set(lastDisabled.map((f) => String(f).toLowerCase()));
      const lowerInlineDisabled = new Set(lastInlineDisabled.map((f) => String(f).toLowerCase()));

      assert.ok(lowerDisabled.has('id'), 'primary key should remain disabled');
      assert.ok(lowerInlineDisabled.has('id'), 'inline view should keep primary key disabled');
      assert.ok(!lowerDisabled.has('category_id'), 'relation field should remain enabled in RowFormModal');
      assert.ok(
        !lowerInlineDisabled.has('category_id'),
        'relation field should remain enabled in InlineTransactionTable',
      );
    } finally {
      root.unmount();
      global.fetch = origFetch;
    }
  });
}

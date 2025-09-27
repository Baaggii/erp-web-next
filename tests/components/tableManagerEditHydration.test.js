import test from 'node:test';
import assert from 'node:assert/strict';

const jsDocument = {
  createElement: () => ({
    style: {},
    appendChild: () => {},
    remove: () => {},
    removeChild: () => {},
  }),
};

global.document = jsDocument;

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  confirm: () => true,
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
  test('TableManager hydrates edit rows with hidden fields', { skip: true }, () => {});
} else {
  test('TableManager hydrates edit rows with hidden fields', async (t) => {
    const origFetch = global.fetch;
    const fetchCalls = [];
    const listRow = { id: 1, name: 'Listed value' };
    global.fetch = async (url) => {
      const target = typeof url === 'string' ? url : url?.url ?? '';
      fetchCalls.push(target);
      if (target === '/api/tables/test/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'id', key: 'PRI', type: 'int' },
            { name: 'name', type: 'varchar' },
            { name: 'hidden_field', type: 'varchar' },
          ],
        };
      }
      if (target === '/api/tables/test/relations') {
        return { ok: true, json: async () => [] };
      }
      if (target.startsWith('/api/tables/test?')) {
        return { ok: true, json: async () => ({ rows: [listRow], count: 1 }) };
      }
      if (target === '/api/tables/test/1') {
        return {
          ok: true,
          json: async () => ({
            id: 1,
            name: 'Listed value',
            hidden_field: 'Secret value',
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const toasts = [];
    const captured = { row: null, rows: null };
    const RowFormModalMock = (props) => {
      captured.row = props.row;
      captured.rows = props.rows;
      return null;
    };

    try {
      const { default: TableManager } = await t.mock.import(
        '../../src/erp.mgt.mn/components/TableManager.jsx',
        {
          '../context/AuthContext.jsx': {
            AuthContext: React.createContext({}),
          },
          '../context/ToastContext.jsx': {
            useToast: () => ({
              addToast: (message, type) => {
                toasts.push({ message, type });
              },
            }),
          },
          './RowFormModal.jsx': { default: RowFormModalMock },
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
            useTranslation: () => ({ t: (k, fallback) => fallback ?? k }),
          },
        },
      );

      const ref = React.createRef();
      const container = document.createElement('div');
      const root = createRoot(container);
      await act(async () => {
        root.render(
          React.createElement(TableManager, {
            table: 'test',
            ref,
            formConfig: {
              visibleFields: ['id', 'name'],
              mainFields: ['id', 'name', 'hidden_field'],
            },
          }),
        );
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(ref.current, 'ref should be populated');
      await act(async () => {
        await ref.current.openEdit(listRow);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      assert.ok(
        fetchCalls.includes('/api/tables/test/1'),
        'should request full record when editing',
      );
      assert.equal(toasts.length, 0, 'should not emit toasts on successful hydration');
      assert.equal(captured.row?.hidden_field, 'Secret value');
      assert.equal(captured.rows?.[0]?.hidden_field, 'Secret value');

      await act(async () => {
        root.unmount();
      });
    } finally {
      global.fetch = origFetch;
    }
  });
}

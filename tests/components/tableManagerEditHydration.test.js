import test from 'node:test';
import assert from 'node:assert/strict';

const listRow = { id: 1, visible_col: 'Visible' };

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
  test('TableManager hydrates hidden fields for edit modal', { skip: true }, () => {});
} else {
  global.document = global.document || { createElement: () => ({}) };
  global.window = global.window || {};
  if (!global.window.addEventListener) global.window.addEventListener = () => {};
  if (!global.window.removeEventListener) global.window.removeEventListener = () => {};

  test('TableManager hydrates hidden fields for edit modal', async (t) => {
    const origFetch = global.fetch;
    let modalRow = null;

    global.fetch = async (url) => {
      if (url === '/api/tables/test/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'id', key: 'PRI' },
            { name: 'visible_col' },
            { name: 'hidden_field' },
          ],
        };
      }
      if (url === '/api/tables/test/relations') {
        return { ok: true, json: async () => [] };
      }
      if (url.startsWith('/api/tables/test?')) {
        return {
          ok: true,
          json: async () => ({ rows: [listRow], count: 1 }),
        };
      }
      if (url === '/api/tenant_tables/test') {
        return { ok: true, json: async () => ({ isShared: true }) };
      }
      if (url === '/api/tables/test/1') {
        return {
          ok: true,
          json: async () => ({ id: 1, visible_col: 'Visible', hidden_field: 'Secret value' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    try {
      const { default: TableManager } = await t.mock.import(
        '../../src/erp.mgt.mn/components/TableManager.jsx',
        {
          '../context/AuthContext.jsx': {
            AuthContext: React.createContext({}),
          },
          '../context/ToastContext.jsx': {
            useToast: () => ({ addToast: () => {} }),
          },
          './RowFormModal.jsx': {
            default: (props) => {
              modalRow = props.row;
              return null;
            },
          },
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
            buttonPerms: { 'Edit transaction': true },
            formConfig: {
              headerFields: ['visible_col', 'hidden_field'],
            },
          }),
        );
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      await act(async () => {
        await ref.current.openEdit({ id: 1, visible_col: 'Visible' });
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(modalRow);
      assert.equal(modalRow.hidden_field, 'Secret value');
      assert.equal(modalRow.visible_col, 'Visible');
      assert.equal(modalRow.id, 1);

      root.unmount();
    } finally {
      global.fetch = origFetch;
    }
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';

global.document = { createElement: () => ({}) };
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  confirm: () => true,
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
  test('timestamp fields render without react', { skip: true }, () => {});
} else {
  test('TableManager renders timestamp as YYYY-MM-DD', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async (url) => {
      if (url === '/api/tables/test/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'id', type: 'int' },
            { name: 'created_at', type: 'timestamp' },
          ],
        };
      }
      if (url === '/api/tables/test/relations') {
        return { ok: true, json: async () => [] };
      }
      if (url.startsWith('/api/display_fields?')) {
        return { ok: true, json: async () => ({ displayFields: [] }) };
      }
      if (url.startsWith('/api/proc_triggers')) {
        return { ok: true, json: async () => [] };
      }
      if (url.startsWith('/api/tables/test?')) {
        return {
          ok: true,
          json: async () => ({ rows: [{ id: 1, created_at: '2024-05-01 12:34:56' }], count: 1 }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const { default: TableManager } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableManager.jsx',
      {
        '../context/AuthContext.jsx': { AuthContext: React.createContext({ company: 1 }) },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        './RowFormModal.jsx': { default: () => null },
        './CascadeDeleteModal.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './RowImageViewModal.jsx': { default: () => null },
        './RowImageUploadModal.jsx': { default: () => null },
        './ImageSearchModal.jsx': { default: () => null },
        './Modal.jsx': { default: () => null },
        './CustomDatePicker.jsx': { default: () => null },
        '../hooks/useGeneralConfig.js': { default: () => ({}) },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/buildImageName.js': { default: () => ({}) },
        '../utils/slugify.js': { default: () => '' },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/normalizeDateInput.js': { default: (v, f) => (f === 'YYYY-MM-DD' ? v.slice(0, 10) : v) },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TableManager, { table: 'test' }));
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.match(container.textContent, /2024-05-01/);
    assert.doesNotMatch(container.textContent, /12:34:56/);
    root.unmount();
    global.fetch = origFetch;
  });

  test('RowFormModal uses YYYY-MM-DD placeholder for date fields', async (t) => {
    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => null },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (p) => React.createElement('div', p) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ user: {}, company: 1, branch: 1, department: 1, userSettings: {} }),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/callProcedure.js': { default: () => {} },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(RowFormModal, {
          visible: true,
          onCancel: () => {},
          onSubmit: () => {},
          columns: ['created_at'],
          row: {},
          fieldTypeMap: { created_at: 'date' },
          labels: { created_at: 'Created At' },
        }),
      );
    });
    const input = container.querySelector('input');
    assert.equal(input?.getAttribute('placeholder'), 'YYYY-MM-DD');
    root.unmount();
  });
}

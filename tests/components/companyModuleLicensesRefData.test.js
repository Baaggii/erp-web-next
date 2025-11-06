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
  test('company_module_licenses loads reference data without company filter', { skip: true }, () => {});
} else {
  test('company_module_licenses loads reference data without company filter', async (t) => {
    const origFetch = global.fetch;
    let refUrl = '';
    global.fetch = async (url) => {
      if (url === '/api/tables/company_module_licenses/columns') {
        return { ok: true, json: async () => [{ name: 'id' }, { name: 'module_key' }] };
      }
      if (url === '/api/tables/company_module_licenses/relations') {
        return {
          ok: true,
          json: async () => [
            {
              COLUMN_NAME: 'module_key',
              REFERENCED_TABLE_NAME: 'modules',
              REFERENCED_COLUMN_NAME: 'key',
            },
          ],
        };
      }
      if (url === '/api/display_fields?table=modules') {
        return { ok: true, json: async () => ({ displayFields: ['name'] }) };
      }
      if (url === '/api/tables/modules/columns') {
        return { ok: true, json: async () => [{ name: 'key' }, { name: 'name' }] };
      }
      if (url.startsWith('/api/tables/modules?')) {
        const u = new URL(url, 'http://example.com');
        assert.equal(u.searchParams.has('company_id'), false);
        refUrl = url;
        return { ok: true, json: async () => ({ rows: [], count: 0 }) };
      }
      if (url.startsWith('/api/tables/company_module_licenses?')) {
        return { ok: true, json: async () => ({ rows: [], count: 0 }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const { default: TableManager } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableManager.jsx',
      {
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ company: 1 }),
        },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: () => {} }),
        },
        './RowFormModal.jsx': { default: () => null },
        './CascadeDeleteModal.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './RowImageViewModal.jsx': { default: () => null },
        './RowImageUploadModal.jsx': { default: () => null },
        './ImageSearchModal.jsx': { default: () => null },
        './Modal.jsx': { default: () => null },
        './CustomDatePicker.jsx': { default: () => null },
        '../hooks/useGeneralConfig.js': { default: () => ({}) },
        '../utils/formatTimestamp.js': { default: () => '2024.01.01 00:00:00' },
        '../utils/buildImageName.js': { default: () => ({}) },
        '../utils/slugify.js': { default: () => '' },
        '../utils/apiBase.js': { API_BASE: '' },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(TableManager, {
          table: 'company_module_licenses',
        }),
      );
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(refUrl.startsWith('/api/tables/modules?'));
    root.unmount();
    global.fetch = origFetch;
  });
}


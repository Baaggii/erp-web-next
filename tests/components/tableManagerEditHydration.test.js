import test from 'node:test';
import assert from 'node:assert/strict';
let React;
let act;
let createRoot;
let haveReact = true;
let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
} catch {
  haveReact = false;
}

if (!haveReact) {
  test('TableManager hydrates edit modal with missing columns', { skip: true }, () => {});
} else {
  test('TableManager hydrates edit modal with missing columns', async (t) => {
    const prevWindow = global.window;
    const prevDocument = global.document;
    const prevNavigator = global.navigator;

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost',
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    dom.window.confirm = () => true;
    dom.window.scrollTo = () => {};

    const toasts = [];
    const modalProps = [];
    const detailCalls = [];

    const origFetch = global.fetch;
    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/tables/test/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'id', key: 'PRI' },
            { name: 'name' },
            { name: 'secret_value' },
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
          json: async () => ({ rows: [{ id: 1, name: 'Row 1' }], count: 1 }),
        };
      }
      if (url === '/api/tables/test/1') {
        detailCalls.push(url);
        return {
          ok: true,
          json: async () => ({ id: 1, SECRET_VALUE: 'hydrated-secret', name: 'Row 1' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const RowFormModalStub = (props) => {
      modalProps.push({ ...props });
      return null;
    };

    const { default: TableManager } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableManager.jsx',
      {
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ company: 1, session: {} }),
        },
        '../context/ToastContext.jsx': {
          useToast: () => ({
            addToast: (...args) => {
              toasts.push(args);
            },
          }),
        },
        './RowFormModal.jsx': { default: RowFormModalStub },
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
        '../utils/normalizeDateInput.js': { default: (v) => v },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(TableManager, {
            table: 'test',
            buttonPerms: { 'Edit transaction': true },
          }),
        );
      });

      for (let i = 0; i < 10; i += 1) {
        if (container.querySelectorAll('button').length > 0) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const editButton = Array.from(container.querySelectorAll('button')).find((btn) =>
        (btn.textContent || '').includes('Edit'),
      );
      assert.ok(editButton, 'expected edit button to be rendered');

      await act(async () => {
        editButton.dispatchEvent(
          new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      for (let i = 0; i < 10; i += 1) {
        const last = modalProps.at(-1);
        if (last?.visible) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const lastProps = modalProps.at(-1);
      assert.ok(lastProps?.visible, 'expected modal to be visible');
      assert.equal(lastProps.row?.secret_value, 'hydrated-secret');
      assert.equal(lastProps.rows?.[0]?.secret_value, 'hydrated-secret');
      assert.equal(toasts.length, 0, 'expected no error toasts');
      assert.ok(detailCalls.length >= 1, 'expected detail fetch to be called');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();

      global.fetch = origFetch;
      global.window = prevWindow;
      global.document = prevDocument;
      global.navigator = prevNavigator;
      dom.window.close();
    }
  });
}

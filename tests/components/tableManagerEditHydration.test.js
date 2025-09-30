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
  test('TableManager handles PK casing differences when editing', { skip: true }, () => {});
  test(
    'RowFormModal hydrates form inputs from case-insensitive row keys',
    { skip: true },
    () => {},
  );
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

  test('TableManager hydrates edit modal for composite key with hyphenated value', async (t) => {
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

    const decodeRowId = (value) => {
      if (value.startsWith('b64:')) {
        const encodedParts = value.slice(4).split('.');
        return encodedParts.map((part) => {
          const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
          const padLength = (4 - (normalized.length % 4)) % 4;
          const padded = normalized + '='.repeat(padLength);
          return Buffer.from(padded, 'base64').toString('utf8');
        });
      }
      return value.split('-');
    };

    const origFetch = global.fetch;
    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/tables/composite_test/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'order_id', key: 'PRI' },
            { name: 'line_code', key: 'PRI' },
            { name: 'name' },
          ],
        };
      }
      if (url === '/api/tables/composite_test/relations') {
        return { ok: true, json: async () => [] };
      }
      if (url.startsWith('/api/display_fields?')) {
        return { ok: true, json: async () => ({ displayFields: [] }) };
      }
      if (url.startsWith('/api/proc_triggers')) {
        return { ok: true, json: async () => [] };
      }
      if (url.startsWith('/api/tables/composite_test?')) {
        return {
          ok: true,
          json: async () => ({
            rows: [
              { order_id: 101, line_code: 'ROW-001', name: 'Composite Row' },
            ],
            count: 1,
          }),
        };
      }
      if (url.startsWith('/api/tables/composite_test/')) {
        const encoded = url.split('/').pop() || '';
        const decoded = decodeRowId(decodeURIComponent(encoded));
        detailCalls.push({ url, parts: decoded });
        return {
          ok: true,
          json: async () => ({
            order_id: Number(decoded[0]),
            line_code: decoded[1],
            secret: 'composite-detail',
          }),
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
            table: 'composite_test',
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
      assert.ok(editButton, 'expected edit button to render for composite table');

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
      assert.equal(lastProps.row?.order_id, 101);
      assert.equal(lastProps.row?.line_code, 'ROW-001');
      assert.equal(lastProps.rows?.[0]?.line_code, 'ROW-001');
      assert.equal(lastProps.rows?.[0]?.secret, 'composite-detail');
      assert.equal(toasts.length, 0, 'expected no error toasts');
      assert.ok(detailCalls.length >= 1, 'expected detail fetch for composite key');
      const lastCall = detailCalls.at(-1);
      assert.deepEqual(lastCall?.parts, ['101', 'ROW-001']);
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

  test('TableManager handles PK casing differences when editing', async (t) => {
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
    const invalidDetailCalls = [];

    const origFetch = global.fetch;
    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/tables/test/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'RECORD_ID', key: 'PRI' },
            { name: 'NAME' },
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
          json: async () => ({ rows: [{ record_id: 42, name: 'Row 42' }], count: 1 }),
        };
      }
      if (url.includes('/undefined')) {
        invalidDetailCalls.push(url);
      }
      if (url === '/api/tables/test/42') {
        detailCalls.push(url);
        return {
          ok: true,
          json: async () => ({ RECORD_ID: 42, NAME: 'Row 42', EXTRA: 'detail' }),
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
      assert.equal(lastProps.row?.record_id, 42);
      assert.equal(lastProps.rows?.[0]?.record_id, 42);
      assert.equal(toasts.length, 0, 'expected no error toasts');
      assert.deepEqual(invalidDetailCalls, [], 'expected no invalid detail fetches');
      assert.ok(detailCalls.includes('/api/tables/test/42'), 'expected detail fetch for id 42');
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

  test('RowFormModal hydrates form inputs from case-insensitive row keys', async (t) => {
    const prevWindow = global.window;
    const prevDocument = global.document;
    const prevNavigator = global.navigator;
    const prevResizeObserver = global.ResizeObserver;
    const prevWindowResizeObserver = prevWindow?.ResizeObserver;

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost',
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    dom.window.confirm = () => true;
    dom.window.scrollTo = () => {};

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    global.ResizeObserver = ResizeObserverMock;
    dom.window.ResizeObserver = ResizeObserverMock;

    const origFetch = global.fetch;
    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/display_fields') {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    };
    dom.window.fetch = global.fetch;

    const authValue = {
      user: { empid: 'EMP-1' },
      company: 'COMP-1',
      branch: 'BR-1',
      department: 'DEP-1',
      userSettings: {},
    };

    const AuthContextMock = React.createContext(authValue);

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => null },
        './Modal.jsx': {
          default: ({ children, visible }) =>
            (visible ? React.createElement('div', { 'data-modal': 'visible' }, children) : null),
        },
        './InlineTransactionTable.jsx': {
          default: React.forwardRef((_props, _ref) => null),
        },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': {
          default: ({ children }) => React.createElement(React.Fragment, null, children),
        },
        '../context/AuthContext.jsx': { AuthContext: AuthContextMock },
        '../hooks/useGeneralConfig.js': { default: () => ({}) },
        '../utils/formatTimestamp.js': { default: () => '2024-01-01 00:00:00' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/callProcedure.js': { default: async () => ({}) },
        '../utils/generatedColumns.js': {
          applyGeneratedColumnEvaluators: () => ({ changed: false }),
          createGeneratedColumnEvaluator: () => null,
        },
        '../utils/apiBase.js': { API_BASE: '' },
        'react-i18next': {
          useTranslation: () => ({ t: (_key, opts) => opts?.defaultValue || _key }),
        },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(
            AuthContextMock.Provider,
            { value: authValue },
            React.createElement(RowFormModal, {
              visible: true,
              onCancel: () => {},
              onSubmit: () => {},
              columns: ['name', 'secret_value'],
              row: { NAME: 'Hydrated Name', SECRET_VALUE: 'Hydrated Secret' },
              labels: { name: 'Name Label', secret_value: 'Secret Label' },
              fieldTypeMap: {},
              defaultValues: {},
              dateField: [],
              autoFillSession: false,
            }),
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const labels = Array.from(container.querySelectorAll('label'));
      const nameLabel = labels.find((el) => (el.textContent || '').includes('Name Label'));
      assert.ok(nameLabel, 'expected Name label to render');
      const nameInput = nameLabel.parentElement.querySelector('input');
      assert.ok(nameInput, 'expected Name input to render');
      assert.equal(nameInput.value, 'Hydrated Name');

      const secretLabel = labels.find((el) => (el.textContent || '').includes('Secret Label'));
      assert.ok(secretLabel, 'expected Secret label to render');
      const secretInput = secretLabel.parentElement.querySelector('input');
      assert.ok(secretInput, 'expected Secret input to render');
      assert.equal(secretInput.value, 'Hydrated Secret');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      global.fetch = origFetch;
      if (prevResizeObserver === undefined) delete global.ResizeObserver;
      else global.ResizeObserver = prevResizeObserver;
      if (prevWindow) {
        if (prevWindowResizeObserver === undefined) delete prevWindow.ResizeObserver;
        else prevWindow.ResizeObserver = prevWindowResizeObserver;
      }
      global.window = prevWindow;
      global.document = prevDocument;
      global.navigator = prevNavigator;
      dom.window.close();
    }
  });
}

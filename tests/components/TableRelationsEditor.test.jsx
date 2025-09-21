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
if (!global.window.confirm) global.window.confirm = () => true;

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
  test('TableRelationsEditor loads relations', { skip: true }, () => {});
  test('TableRelationsEditor saves and deletes relations', { skip: true }, () => {});
} else {
  test('TableRelationsEditor loads relations', async (t) => {
    const origFetch = global.fetch;
    const toasts = [];
    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/tables/orders/columns') {
        return {
          ok: true,
          json: async () => [{ name: 'id' }, { name: 'user_id' }],
        };
      }
      if (url === '/api/tables/orders/custom-relations') {
        return {
          ok: true,
          json: async () => ({
            relations: { user_id: { targetTable: 'users', targetColumn: 'id' } },
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    try {
      const { default: TableRelationsEditor } = await t.mock.import(
        '../../src/erp.mgt.mn/components/TableRelationsEditor.jsx',
        {
          '../context/ToastContext.jsx': {
            useToast: () => ({ addToast: (msg, type) => toasts.push({ msg, type }) }),
          },
        },
      );

      const container = document.createElement('div');
      const root = createRoot(container);
      await act(async () => {
        root.render(
          React.createElement(TableRelationsEditor, {
            table: 'orders',
            tables: ['orders', 'users'],
          }),
        );
      });
      for (let i = 0; i < 5; i += 1) {
        if (container.querySelector('[data-testid="custom-relations-table"]')) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const options = Array.from(container.querySelectorAll('select option')).map(
        (opt) => opt.value,
      );
      assert.ok(options.includes('user_id'));
      const tableText = container.textContent || '';
      assert.match(tableText, /user_id/);
      assert.match(tableText, /users\.id/);
      root.unmount();
    } finally {
      global.fetch = origFetch;
    }
  });

  test('TableRelationsEditor saves and deletes relations', async (t) => {
    const origFetch = global.fetch;
    const toasts = [];
    const fetchCalls = [];
    global.fetch = async (input, options = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = options?.method || 'GET';
      fetchCalls.push({ url, method, body: options?.body });
      if (url === '/api/tables/orders/columns') {
        return {
          ok: true,
          json: async () => [{ name: 'user_id' }, { name: 'company_id' }],
        };
      }
      if (url === '/api/tables/orders/custom-relations') {
        return { ok: true, json: async () => ({ relations: {} }) };
      }
      if (url === '/api/tables/users/columns') {
        return { ok: true, json: async () => [{ name: 'id' }, { name: 'email' }] };
      }
      if (
        url === '/api/tables/orders/custom-relations/user_id' &&
        method === 'PUT'
      ) {
        return {
          ok: true,
          json: async () => ({ targetTable: 'users', targetColumn: 'id' }),
        };
      }
      if (
        url === '/api/tables/orders/custom-relations/user_id' &&
        method === 'DELETE'
      ) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    };

    try {
      const { default: TableRelationsEditor } = await t.mock.import(
        '../../src/erp.mgt.mn/components/TableRelationsEditor.jsx',
        {
          '../context/ToastContext.jsx': {
            useToast: () => ({ addToast: (msg, type) => toasts.push({ msg, type }) }),
          },
        },
      );

      const container = document.createElement('div');
      const root = createRoot(container);
      await act(async () => {
        root.render(
          React.createElement(TableRelationsEditor, {
            table: 'orders',
            tables: ['orders', 'users'],
          }),
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const selects = container.querySelectorAll('select');
      assert.equal(selects.length, 3);
      await act(async () => {
        selects[0].value = 'user_id';
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => {
        selects[1].value = 'users';
        selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await act(async () => {
        selects[2].value = 'id';
        selects[2].dispatchEvent(new Event('change', { bubbles: true }));
      });
      const saveBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        saveBtn.dispatchEvent(new Event('click', { bubbles: true }));
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.ok(
        fetchCalls.some(
          (c) =>
            c.url === '/api/tables/orders/custom-relations/user_id' &&
            c.method === 'PUT' &&
            typeof c.body === 'string' &&
            c.body.includes('"targetTable":"users"'),
        ),
      );
      assert.ok(toasts.some((t) => t.msg === 'Relation saved' && t.type === 'success'));
      let tableText = container.textContent || '';
      assert.match(tableText, /users\.id/);

      const deleteBtn = container.querySelector('table button');
      await act(async () => {
        deleteBtn.dispatchEvent(new Event('click', { bubbles: true }));
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.ok(
        fetchCalls.some(
          (c) =>
            c.url === '/api/tables/orders/custom-relations/user_id' &&
            c.method === 'DELETE',
        ),
      );
      assert.ok(
        toasts.some((t) => t.msg === 'Relation removed' && t.type === 'success'),
      );
      tableText = container.textContent || '';
      assert.match(tableText, /No custom relations configured/);
      root.unmount();
    } finally {
      global.fetch = origFetch;
    }
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = Symbol('listeners');

function createElement(tag) {
  const el = {
    tagName: String(tag || '').toUpperCase(),
    nodeType: 1,
    children: [],
    style: {},
    attributes: {},
    dataset: {},
    parentNode: null,
    ownerDocument: null,
    appendChild(child) {
      if (!child) return child;
      this.children.push(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    insertBefore(child, before) {
      const idx = this.children.indexOf(before);
      if (idx === -1) return this.appendChild(child);
      this.children.splice(idx, 0, child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith('data-')) {
        const key = name.slice(5);
        this.dataset[key] = String(value);
      }
      if (name === 'value') {
        this.value = value;
      }
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    addEventListener(type, handler) {
      if (!this[listeners]) this[listeners] = {};
      this[listeners][type] = handler;
    },
    removeEventListener(type) {
      if (this[listeners]) delete this[listeners][type];
    },
    dispatchEvent(event) {
      event.target = event.target || this;
      event.currentTarget = this;
      const handler = this[listeners]?.[event.type];
      if (typeof handler === 'function') handler(event);
      return true;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const results = [];
      const matcher = (node) => {
        if (!node || node.nodeType !== 1) return;
        if (selector.startsWith('[data-testid="')) {
          const key = selector.slice(13, -2);
          if (node.dataset?.testid === key) results.push(node);
        } else if (!selector.includes('[') && !selector.includes('.')) {
          if (node.tagName && node.tagName.toLowerCase() === selector.toLowerCase()) {
            results.push(node);
          }
        }
        node.children?.forEach?.((child) => matcher(child));
      };
      this.children.forEach((child) => matcher(child));
      return results;
    },
    set textContent(value) {
      this._text = String(value);
      this.children = [];
    },
    get textContent() {
      if (this._text != null) return this._text;
      return this.children.map((child) => child.textContent || '').join('');
    },
  };
  if (tag === 'select' || tag === 'input') {
    Object.defineProperty(el, 'value', {
      get() {
        return this._value ?? '';
      },
      set(v) {
        this._value = String(v);
      },
      configurable: true,
    });
  }
  if (tag === 'option') {
    Object.defineProperty(el, 'value', {
      get() {
        return this._value ?? this._text ?? '';
      },
      set(v) {
        this._value = String(v);
      },
      configurable: true,
    });
  }
  el.ownerDocument = global.document;
  return el;
}

function createTextNode(text) {
  return {
    nodeType: 3,
    textContent: String(text),
    parentNode: null,
    ownerDocument: global.document,
  };
}

global.document = { createElement, createTextNode };
global.window = global.window || {};
if (!global.window.addEventListener) global.window.addEventListener = () => {};
if (!global.window.removeEventListener) global.window.removeEventListener = () => {};
if (!global.Event) {
  global.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };
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

const origFetch = global.fetch;

function restoreFetch() {
  if (origFetch) {
    global.fetch = origFetch;
  } else {
    delete global.fetch;
  }
}

function renderComponent(Component, props) {
  const container = document.createElement('div');
  container.ownerDocument = global.document;
  const root = createRoot(container);
  return { container, root, Component };
}

function fireEvent(node, type) {
  node.dispatchEvent({ type, target: node });
}

if (!haveReact) {
  test('TableRelationsEditor interactions', { skip: true }, () => {});
} else {
  test('TableRelationsEditor loads custom and database relations', async (t) => {
    let customData = [
      {
        COLUMN_NAME: 'customer_id',
        REFERENCED_TABLE_NAME: 'customers',
        REFERENCED_COLUMN_NAME: 'id',
        isCustom: true,
      },
    ];
    const dbData = [
      {
        COLUMN_NAME: 'branch_id',
        REFERENCED_TABLE_NAME: 'branches',
        REFERENCED_COLUMN_NAME: 'id',
        isCustom: false,
      },
    ];
    const fetchCalls = [];
    global.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = init.method || 'GET';
      fetchCalls.push(`${method} ${url}`);
      if (method === 'GET' && url === '/api/tables/orders/columns') {
        return { ok: true, json: async () => [{ name: 'id' }, { name: 'branch_id' }, { name: 'customer_id' }] };
      }
      if (method === 'GET' && url === '/api/tables/orders/relations') {
        return { ok: true, json: async () => [...dbData, ...customData] };
      }
      if (method === 'GET' && url === '/api/tables/orders/relations/custom') {
        return { ok: true, json: async () => customData };
      }
      throw new Error(`Unhandled request ${method} ${url}`);
    };

    const toasts = [];
    const { default: TableRelationsEditor } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableRelationsEditor.jsx',
      {
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: (...args) => toasts.push(args) }),
        },
        'react-i18next': {
          useTranslation: () => ({ t: (_key, defaultText) => defaultText || _key }),
        },
      },
    );

    const { container, root } = renderComponent(TableRelationsEditor, {});
    await act(async () => {
      root.render(React.createElement(TableRelationsEditor, {
        table: 'orders',
        tables: ['orders', 'customers', 'branches'],
      }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const customRows = container.querySelectorAll('[data-testid="custom-relation-row"]');
    assert.equal(customRows.length, 1);
    const databaseRows = container.querySelectorAll('[data-testid="database-relation-row"]');
    assert.equal(databaseRows.length, 1);
    const customLabel = container.querySelector('[data-testid="custom-column-customer_id"]');
    assert.ok(customLabel);
    assert.equal(customLabel.textContent, 'customer_id');
    root.unmount();
    restoreFetch();
    assert.equal(toasts.length, 0);
    assert.deepEqual(fetchCalls, [
      'GET /api/tables/orders/columns',
      'GET /api/tables/orders/relations',
      'GET /api/tables/orders/relations/custom',
    ]);
  });

  test('TableRelationsEditor saves a relation', async (t) => {
    let customData = [];
    global.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = init.method || 'GET';
      if (method === 'GET' && url === '/api/tables/orders/columns') {
        return { ok: true, json: async () => [{ name: 'id' }, { name: 'customer_id' }] };
      }
      if (method === 'GET' && url === '/api/tables/orders/relations') {
        return { ok: true, json: async () => customData };
      }
      if (method === 'GET' && url === '/api/tables/orders/relations/custom') {
        return { ok: true, json: async () => customData };
      }
      if (method === 'GET' && url === '/api/tables/customers/columns') {
        return { ok: true, json: async () => [{ name: 'id' }] };
      }
      if (method === 'PUT' && url === '/api/tables/orders/relations/custom') {
        const payload = JSON.parse(init.body);
        customData = [
          {
            COLUMN_NAME: payload.column,
            REFERENCED_TABLE_NAME: payload.referencedTable,
            REFERENCED_COLUMN_NAME: payload.referencedColumn,
            isCustom: true,
          },
        ];
        return { ok: true, json: async () => customData[0] };
      }
      throw new Error(`Unhandled request ${method} ${url}`);
    };

    const toasts = [];
    const { default: TableRelationsEditor } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableRelationsEditor.jsx',
      {
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: (...args) => toasts.push(args) }),
        },
        'react-i18next': {
          useTranslation: () => ({ t: (_key, defaultText) => defaultText || _key }),
        },
      },
    );

    const { container, root } = renderComponent(TableRelationsEditor, {});
    await act(async () => {
      root.render(React.createElement(TableRelationsEditor, {
        table: 'orders',
        tables: ['orders', 'customers'],
      }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const columnSelect = container.querySelector('[data-testid="relation-column"]');
    const refTableSelect = container.querySelector('[data-testid="relation-referenced-table"]');
    await act(async () => {
      columnSelect.value = 'customer_id';
      fireEvent(columnSelect, 'change');
    });
    await act(async () => {
      refTableSelect.value = 'customers';
      fireEvent(refTableSelect, 'change');
    });
    await act(async () => {
      await Promise.resolve();
    });
    const refColumnSelect = container.querySelector('[data-testid="relation-referenced-column"]');
    await act(async () => {
      refColumnSelect.value = 'id';
      fireEvent(refColumnSelect, 'change');
    });
    const saveButton = container.querySelector('[data-testid="relation-save"]');
    await act(async () => {
      fireEvent(saveButton, 'click');
    });
    await act(async () => {
      await Promise.resolve();
    });
    const customRow = container.querySelector('[data-testid="custom-column-customer_id"]');
    assert.ok(customRow);
    assert.equal(customRow.textContent, 'customer_id');
    root.unmount();
    restoreFetch();
    assert.ok(toasts.some(([, type]) => type === 'success'));
  });

  test('TableRelationsEditor deletes a relation', async (t) => {
    let customData = [
      {
        COLUMN_NAME: 'customer_id',
        REFERENCED_TABLE_NAME: 'customers',
        REFERENCED_COLUMN_NAME: 'id',
        isCustom: true,
      },
    ];
    global.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = init.method || 'GET';
      if (method === 'GET' && url === '/api/tables/orders/columns') {
        return { ok: true, json: async () => [{ name: 'customer_id' }] };
      }
      if (method === 'GET' && url === '/api/tables/orders/relations') {
        return { ok: true, json: async () => customData };
      }
      if (method === 'GET' && url === '/api/tables/orders/relations/custom') {
        return { ok: true, json: async () => customData };
      }
      if (method === 'DELETE' && url === '/api/tables/orders/relations/custom/customer_id') {
        customData = [];
        return { ok: true, status: 204, json: async () => ({}) };
      }
      throw new Error(`Unhandled request ${method} ${url}`);
    };

    const toasts = [];
    const { default: TableRelationsEditor } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableRelationsEditor.jsx',
      {
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: (...args) => toasts.push(args) }),
        },
        'react-i18next': {
          useTranslation: () => ({ t: (_key, defaultText) => defaultText || _key }),
        },
      },
    );

    const { container, root } = renderComponent(TableRelationsEditor, {});
    await act(async () => {
      root.render(React.createElement(TableRelationsEditor, {
        table: 'orders',
        tables: ['orders', 'customers'],
      }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const deleteButton = container.querySelector('[data-testid="delete-relation-customer_id"]');
    await act(async () => {
      fireEvent(deleteButton, 'click');
    });
    await act(async () => {
      await Promise.resolve();
    });
    const customRows = container.querySelectorAll('[data-testid="custom-relation-row"]');
    assert.equal(customRows.length, 0);
    root.unmount();
    restoreFetch();
    assert.ok(toasts.some(([, type]) => type === 'success'));
  });
}


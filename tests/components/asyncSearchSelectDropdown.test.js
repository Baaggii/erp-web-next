import test from 'node:test';
import assert from 'node:assert/strict';


let React;
let act;
let createRoot;
let JSDOM;
let haveReact = true;
try {
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
  ({ JSDOM } = await import('jsdom'));
} catch {
  haveReact = false;
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
  });
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevNavigator = global.navigator;
  const prevRAF = global.requestAnimationFrame;
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;
  global.CustomEvent = dom.window.CustomEvent;
  global.MouseEvent = dom.window.MouseEvent;
  global.KeyboardEvent = dom.window.KeyboardEvent;
  if (!global.getComputedStyle) global.getComputedStyle = dom.window.getComputedStyle;
  if (!global.requestAnimationFrame) {
    global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  }
  return () => {
    global.window = prevWindow;
    global.document = prevDocument;
    global.navigator = prevNavigator;
    global.requestAnimationFrame = prevRAF;
  };
}

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

if (!haveReact) {
  test('AsyncSearchSelect sends search parameters with queries', { skip: true }, () => {});
  test('AsyncSearchSelect fetches additional pages when needed', { skip: true }, () => {});
  test('AsyncSearchSelect falls back to existing options when remote search is empty', { skip: true }, () => {});
} else {
  test('AsyncSearchSelect sends search parameters with queries', async (t) => {
    const restoreDom = setupDom();
    const origFetch = global.fetch;
    const requests = [];

    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      requests.push(url);
      if (url.startsWith('/api/tenant_tables/items')) {
        return { ok: true, json: async () => ({ tenantKeys: [] }) };
      }
      if (url.startsWith('/api/tables/items?')) {
        const parsed = new URL(url, 'http://localhost');
        const search = parsed.searchParams.get('search') || '';
        if (!search) {
          return {
            ok: true,
            json: async () => ({
              rows: [
                { id: 1, code: 'A1', name: 'Alpha' },
                { id: 2, code: 'B2', name: 'Beta' },
              ],
              count: 2,
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            rows: [
              { id: 3, code: 'A3', name: 'Alpha Prime' },
            ],
            count: 1,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    t.after(() => {
      global.fetch = origFetch;
      restoreDom();
    });

    const { default: AsyncSearchSelect } = await t.mock.import(
      '../../src/erp.mgt.mn/components/AsyncSearchSelect.jsx',
      {
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ company: 11, branch: 22, department: 33 }),
        },
        '../utils/tenantKeys.js': { getTenantKeyList: () => [] },
        '../utils/buildAsyncSelectOptions.js': {
          buildOptionsForRows: async ({ rows, idField, labelFields }) =>
            rows.map((row) => ({
              value: row[idField],
              label:
                labelFields
                  .map((field) => row[field])
                  .filter((part) => part != null && part !== '')
                  .join(' - ') || String(row[idField]),
            })),
        },
        'react-dom': { createPortal: (node) => node },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleChange = t.mock.fn();

    await act(async () => {
      root.render(
        React.createElement(AsyncSearchSelect, {
          table: 'items',
          searchColumn: 'code',
          searchColumns: ['code'],
          labelFields: ['name'],
          idField: 'id',
          value: '',
          onChange: handleChange,
        }),
      );
    });

    await flushEffects();
    await flushEffects();

    const input = container.querySelector('input');
    assert.ok(input, 'input should be rendered');

    await act(async () => {
      input.dispatchEvent(new window.Event('focus', { bubbles: true }));
    });

    input.value = 'Alpha';
    await act(async () => {
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    });

    await flushEffects();
    await flushEffects();

    assert.ok(handleChange.mock.calls.some((call) => call.arguments?.[0] === 'Alpha'));

    const searchRequest = requests.find((url) => url.includes('search='));
    assert.ok(searchRequest, 'expected a fetch call with search parameters');
    const parsed = new URL(searchRequest, 'http://localhost');
    assert.equal(parsed.searchParams.get('search'), 'Alpha');
    assert.equal(parsed.searchParams.get('searchColumns'), 'code,id,name');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test('AsyncSearchSelect fetches additional pages when needed', async (t) => {
    const restoreDom = setupDom();
    const origFetch = global.fetch;
    const requests = [];

    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      requests.push(url);
      if (url.startsWith('/api/tenant_tables/items')) {
        return { ok: true, json: async () => ({ tenantKeys: [] }) };
      }
      if (url.startsWith('/api/tables/items?')) {
        const parsed = new URL(url, 'http://localhost');
        const search = parsed.searchParams.get('search') || '';
        const page = parsed.searchParams.get('page');
        if (!search) {
          return {
            ok: true,
            json: async () => ({
              rows: [
                { id: 1, code: 'A1', name: 'Alpha' },
              ],
              count: 1,
            }),
          };
        }
        if (page === '1') {
          return {
            ok: true,
            json: async () => ({ rows: [], count: 120 }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            rows: [
              { id: 9, code: 'Z9', name: 'Zeta' },
            ],
            count: 120,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    t.after(() => {
      global.fetch = origFetch;
      restoreDom();
    });

    const { default: AsyncSearchSelect } = await t.mock.import(
      '../../src/erp.mgt.mn/components/AsyncSearchSelect.jsx',
      {
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ company: 1, branch: 2, department: 3 }),
        },
        '../utils/tenantKeys.js': { getTenantKeyList: () => [] },
        '../utils/buildAsyncSelectOptions.js': {
          buildOptionsForRows: async ({ rows, idField, labelFields }) =>
            rows.map((row) => ({
              value: row[idField],
              label:
                labelFields
                  .map((field) => row[field])
                  .filter((part) => part != null && part !== '')
                  .join(' - ') || String(row[idField]),
            })),
        },
        'react-dom': { createPortal: (node) => node },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AsyncSearchSelect, {
          table: 'items',
          searchColumn: 'code',
          labelFields: ['name'],
          idField: 'id',
          value: '',
          onChange: () => {},
        }),
      );
    });

    await flushEffects();
    await flushEffects();

    const input = container.querySelector('input');
    input.value = 'Zeta';
    await act(async () => {
      input.dispatchEvent(new window.Event('focus', { bubbles: true }));
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    });

    await flushEffects();
    await flushEffects();
    await flushEffects();

    const searchRequests = requests.filter((url) => url.includes('search='));
    assert.equal(searchRequests.length, 2, 'should request two pages when first search page is empty');
    const parsedLast = new URL(searchRequests[1], 'http://localhost');
    assert.equal(parsedLast.searchParams.get('page'), '2');

    const listItems = Array.from(container.querySelectorAll('li'));
    assert.ok(listItems.some((li) => li.textContent.includes('Zeta')));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test('AsyncSearchSelect falls back to existing options when remote search is empty', async (t) => {
    const restoreDom = setupDom();
    const origFetch = global.fetch;
    const requests = [];

    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      requests.push(url);
      if (url.startsWith('/api/tenant_tables/items')) {
        return { ok: true, json: async () => ({ tenantKeys: [] }) };
      }
      if (url.startsWith('/api/tables/items?')) {
        const parsed = new URL(url, 'http://localhost');
        const search = parsed.searchParams.get('search') || '';
        if (!search) {
          return {
            ok: true,
            json: async () => ({
              rows: [
                { id: 1, code: 'A1', name: 'Alpha' },
                { id: 2, code: 'B2', name: 'Beta' },
              ],
              count: 2,
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ rows: [], count: 0 }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    t.after(() => {
      global.fetch = origFetch;
      restoreDom();
    });

    const { default: AsyncSearchSelect } = await t.mock.import(
      '../../src/erp.mgt.mn/components/AsyncSearchSelect.jsx',
      {
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ company: 5, branch: 6, department: 7 }),
        },
        '../utils/tenantKeys.js': { getTenantKeyList: () => [] },
        '../utils/buildAsyncSelectOptions.js': {
          buildOptionsForRows: async ({ rows, idField, labelFields }) =>
            rows.map((row) => ({
              value: row[idField],
              label:
                labelFields
                  .map((field) => row[field])
                  .filter((part) => part != null && part !== '')
                  .join(' - ') || String(row[idField]),
            })),
        },
        'react-dom': { createPortal: (node) => node },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AsyncSearchSelect, {
          table: 'items',
          searchColumn: 'code',
          labelFields: ['name'],
          idField: 'id',
          value: '',
          onChange: () => {},
        }),
      );
    });

    await flushEffects();
    await flushEffects();

    const input = container.querySelector('input');
    input.value = 'Alpha';
    await act(async () => {
      input.dispatchEvent(new window.Event('focus', { bubbles: true }));
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    });

    await flushEffects();
    await flushEffects();

    const searchRequests = requests.filter((url) => url.includes('search='));
    assert.equal(searchRequests.length, 1);

    const listItems = Array.from(container.querySelectorAll('li'));
    assert.ok(listItems.length > 0, 'should display existing options');
    assert.ok(listItems.some((li) => li.textContent.includes('Alpha')));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
}

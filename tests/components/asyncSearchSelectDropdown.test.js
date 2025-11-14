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

const PAGE_SIZE = 50;

if (!haveReact) {
  test('AsyncSearchSelect sends search parameters with queries', { skip: true }, () => {});
  test('AsyncSearchSelect fetches additional pages when needed', { skip: true }, () => {});
  test('AsyncSearchSelect hides stale options when remote search is empty', { skip: true }, () => {});
  test(
    'AsyncSearchSelect keeps paginating locally after remote search fallback',
    { skip: true },
    () => {},
  );
} else {
  test('AsyncSearchSelect sends search parameters with queries', async (t) => {
    const restoreDom = setupDom();
    const origFetch = global.fetch;
    const requests = [];

    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      requests.push(url);
      if (url.startsWith('/api/display_fields?table=items')) {
        return {
          ok: true,
          json: async () => ({ idField: 'id', displayFields: ['name', 'sku'] }),
        };
      }
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
    assert.equal(parsed.searchParams.get('searchColumns'), 'code,id,name,sku');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test(
    'AsyncSearchSelect falls back to client filtering when server search misses display labels',
    async (t) => {
      const restoreDom = setupDom();
      const origFetch = global.fetch;
      const requests = [];

      const dataset = [
        { id: 1, code: 'AA-001', description: 'Alpha Item' },
        { id: 2, code: 'BB-002', description: 'Beta Bundle' },
        { id: 3, code: 'CC-003', description: 'Gamma Pack' },
      ];

      global.fetch = async (input) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        requests.push(url);
        if (url.startsWith('/api/display_fields?table=items')) {
          return {
            ok: true,
            json: async () => ({ idField: 'id', displayFields: ['code', 'description'] }),
          };
        }
        if (url.startsWith('/api/tenant_tables/items')) {
          return { ok: true, json: async () => ({ tenantKeys: [] }) };
        }
        if (url.startsWith('/api/tables/items?')) {
          const parsed = new URL(url, 'http://localhost');
          const search = parsed.searchParams.get('search') || '';
          const page = Number(parsed.searchParams.get('page') || 1);
          if (search) {
            return {
              ok: true,
              json: async () => ({ rows: [], count: 0 }),
            };
          }
          const start = (page - 1) * PAGE_SIZE;
          const rows = dataset.slice(start, start + PAGE_SIZE);
          return {
            ok: true,
            json: async () => ({ rows, count: dataset.length }),
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
            AuthContext: React.createContext({ company: 7 }),
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
            searchColumns: ['code'],
            labelFields: ['description'],
            idField: 'id',
            value: '',
          }),
        );
      });

      await flushEffects();
      await flushEffects();

      requests.length = 0;

      const input = container.querySelector('input');
      assert.ok(input, 'input should be present');

      await act(async () => {
        input.dispatchEvent(new window.Event('focus', { bubbles: true }));
      });

      input.value = 'Beta';
      await act(async () => {
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        input.dispatchEvent(new window.Event('change', { bubbles: true }));
      });

      await flushEffects();
      await flushEffects();
      await flushEffects();

      const searchRequest = requests.find((url) => url.includes('search=Beta'));
      assert.ok(searchRequest, 'expected remote search attempt');

      const unfilteredRequests = requests.filter((url) =>
        url.startsWith('/api/tables/items?') && !url.includes('search='),
      );
      assert.ok(
        unfilteredRequests.length >= 1,
        'expected fallback fetch without search parameters',
      );

      const items = Array.from(document.querySelectorAll('li'));
      assert.ok(
        items.some((node) => node.textContent.includes('Beta Bundle')),
        'expected dropdown to include the label text from display fields',
      );
      assert.deepEqual(
        items.map((node) => node.textContent.trim()),
        ['Beta Bundle'],
        'expected fallback filtering to keep only the matching option',
      );

      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  );

  test('AsyncSearchSelect fetches additional pages when needed', async (t) => {
    const restoreDom = setupDom();
    const origFetch = global.fetch;
    const requests = [];

    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      requests.push(url);
      if (url.startsWith('/api/display_fields?table=items')) {
        return {
          ok: true,
          json: async () => ({ idField: 'id', displayFields: ['code'] }),
        };
      }
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

  test(
    'AsyncSearchSelect keeps paginating locally after remote search fallback',
    async (t) => {
      const restoreDom = setupDom();
      const origFetch = global.fetch;
      const requests = [];

      global.fetch = async (input) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        requests.push(url);
        if (url.startsWith('/api/display_fields?table=items')) {
          return {
            ok: true,
            json: async () => ({ idField: 'id', displayFields: ['name', 'code'] }),
          };
        }
        if (url.startsWith('/api/tenant_tables/items')) {
          return { ok: true, json: async () => ({ tenantKeys: [] }) };
        }
        if (url.startsWith('/api/tables/items?')) {
          const parsed = new URL(url, 'http://localhost');
          const page = parsed.searchParams.get('page');
          const search = parsed.searchParams.get('search');
          if (search) {
            return { ok: true, json: async () => ({ rows: [], count: 200 }) };
          }
          if (page === '1') {
            return {
              ok: true,
              json: async () => ({
                rows: [
                  { id: 10, code: 'Q1', name: 'No match' },
                  { id: 11, code: 'Q2', name: 'Still nothing' },
                ],
                count: 200,
              }),
            };
          }
          if (page === '2') {
            return {
              ok: true,
              json: async () => ({
                rows: [
                  { id: 101, code: 'A-101', name: 'Alpha Local' },
                ],
                count: 200,
              }),
            };
          }
          if (page === '3') {
            return {
              ok: true,
              json: async () => ({
                rows: [
                  { id: 102, code: 'A-102', name: 'Alpha Remote' },
                ],
                count: 200,
              }),
            };
          }
          return { ok: true, json: async () => ({ rows: [], count: 200 }) };
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
            AuthContext: React.createContext({ company: 7, branch: 8, department: 9 }),
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
      await flushEffects();

      const searchRequests = requests.filter((url) => url.includes('search='));
      assert.equal(searchRequests.length, 1, 'remote search should only happen once');
      const listAfterFallback = Array.from(container.querySelectorAll('li'));
      assert.ok(listAfterFallback.some((li) => li.textContent.includes('Alpha Local')));

      const list = container.querySelector('ul');
      assert.ok(list, 'dropdown list should render');
      Object.defineProperties(list, {
        scrollTop: { value: 100, configurable: true, writable: true },
        clientHeight: { value: 100, configurable: true, writable: true },
        scrollHeight: { value: 100, configurable: true, writable: true },
      });

      await act(async () => {
        list.dispatchEvent(new window.Event('scroll'));
      });

      await flushEffects();
      await flushEffects();

      const page3Request = requests.find(
        (url) => url.includes('/api/tables/items?') && url.includes('page=3'),
      );
      assert.ok(page3Request, 'expected a third page request after scrolling');
      assert.ok(!page3Request.includes('search='), 'local pagination should omit search params');

      const listAfterScroll = Array.from(container.querySelectorAll('li'));
      assert.ok(listAfterScroll.some((li) => li.textContent.includes('Alpha Remote')));

      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  );

  test('AsyncSearchSelect hides stale options when remote search is empty', async (t) => {
    const restoreDom = setupDom();
    const origFetch = global.fetch;
    const requests = [];

    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      requests.push(url);
      if (url.startsWith('/api/display_fields?table=items')) {
        return {
          ok: true,
          json: async () => ({ idField: 'id', displayFields: [] }),
        };
      }
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
    assert.equal(listItems.length, 0, 'should not display stale options');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
}

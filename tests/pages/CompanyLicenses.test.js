import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('CompanyLicenses refreshes caches after toggle', { skip: true }, () => {});
} else {
  const ensureWindow = () => {
    if (!global.window) global.window = {};
  };

  function createReactStub(states, setters, indexRef, contextMap) {
    return {
      useState(initial) {
        const idx = indexRef.current;
        if (states.length <= idx) {
          states[idx] = initial;
        }
        const setter = (value) => {
          states[idx] = typeof value === 'function' ? value(states[idx]) : value;
        };
        setters[idx] = setter;
        indexRef.current += 1;
        return [states[idx], setter];
      },
      useEffect(fn) {
        fn();
      },
      useContext(ctx) {
        return contextMap.get(ctx);
      },
      createElement(type, props, ...children) {
        return { type, props: { ...(props || {}), children } };
      },
    };
  }

  function findNode(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    const children = node.props?.children;
    if (!children) return null;
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }

  test('CompanyLicenses refreshes caches after toggle', async () => {
    ensureWindow();
    global.alert = () => {};

    const fetchCalls = [];
    global.fetch = mock.fn(async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (!options.method) {
        return { ok: true, json: async () => [] };
      }
      if (options.method === 'PUT') {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => [] };
    });

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const authValue = { company: 123 };
    const AuthContextStub = {};
    const contextMap = new Map([[AuthContextStub, authValue]]);
    const reactMock = createReactStub(states, setters, indexRef, contextMap);

    const refreshCompanyModulesMock = mock.fn(() => {});
    const refreshModulesMock = mock.fn(() => {});

    const { default: CompanyLicensesPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/CompanyLicenses.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
        },
        '../context/AuthContext.jsx': { AuthContext: AuthContextStub },
        '../hooks/useCompanyModules.js': {
          refreshCompanyModules: refreshCompanyModulesMock,
        },
        '../hooks/useModules.js': {
          refreshModules: refreshModulesMock,
        },
      },
    );

    function render() {
      indexRef.current = 0;
      return CompanyLicensesPage();
    }

    render();
    await Promise.resolve();

    const setLicenses = setters[0];
    setLicenses([
      {
        company_id: 123,
        module_key: 'inventory',
        licensed: true,
        company_name: 'Target Co',
        label: 'Inventory',
      },
    ]);

    const tree = render();
    const toggleButton = findNode(
      tree,
      (node) => node.type === 'button' && node.props?.children?.includes('Идэвхгүй болгох'),
    );
    assert.ok(toggleButton, 'toggle button should exist');

    await toggleButton.props.onClick();

    assert.equal(refreshCompanyModulesMock.mock.calls.length, 1);
    assert.deepEqual(refreshCompanyModulesMock.mock.calls[0].arguments, [123]);
    assert.equal(refreshModulesMock.mock.calls.length, 1);

    assert.ok(fetchCalls.some((call) => call.options?.method === 'PUT'), 'toggle request sent');

    delete global.fetch;
    delete global.alert;
  });
}

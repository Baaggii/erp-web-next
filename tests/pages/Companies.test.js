import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('Companies page sends full backup payload on delete', { skip: true }, () => {});
  test('Companies page restores full backups via dedicated endpoint', { skip: true }, () => {});
} else {
  const ensureWindow = () => {
    if (!global.window) global.window = {};
    if (!global.window.confirm) global.window.confirm = () => true;
    if (!global.window.prompt) global.window.prompt = () => '';
    if (!global.window.dispatchEvent) global.window.dispatchEvent = () => {};
  };

  function createReactStub(states, setters, indexRef) {
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
      useMemo(fn) {
        return fn();
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

  test('Companies page sends full backup payload on delete', async () => {
    ensureWindow();
    const fetchCalls = [];
    const companies = [{ id: 14, name: 'FullCo' }];
    global.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      if (url === '/api/companies') {
        return { ok: true, json: async () => companies };
      }
      if (url === '/api/companies/backups') {
        return { ok: true, json: async () => ({ backups: [] }) };
      }
      if (url === '/api/companies/14') {
        return {
          ok: true,
          json: async () => ({
            backup: { type: 'full' },
            company: { id: 14, name: 'FullCo' },
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const reactMock = createReactStub(states, setters, indexRef);

    const confirmResponses = [true, true];
    let confirmIndex = 0;
    global.window.confirm = () => confirmResponses[confirmIndex++] ?? true;
    global.window.prompt = () => 'Full export';

    const { default: CompaniesPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Companies.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          createElement: reactMock.createElement,
        },
        'react-router-dom': { useNavigate: () => () => {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useModules.js': { useModules: () => [] },
        '../utils/modulePath.js': { default: () => '' },
      },
    );

    function render() {
      indexRef.current = 0;
      return CompaniesPage();
    }

    render();
    await Promise.resolve();
    const tree = render();

    const deleteButton = findNode(
      tree,
      (node) => node.type === 'button' && node.props?.children?.includes('Delete'),
    );
    assert.ok(deleteButton, 'Delete button not found');
    await deleteButton.props.onClick();

    const deleteCall = fetchCalls.find((call) => call.url === '/api/companies/14');
    assert.ok(deleteCall, 'Delete request not issued');
    const payload = JSON.parse(deleteCall.options?.body || '{}');
    assert.equal(payload.backupType, 'full');

    delete global.fetch;
  });

  test('Companies page restores full backups via dedicated endpoint', async () => {
    ensureWindow();
    const fetchCalls = [];
    const companies = [{ id: 7, name: 'Target' }];
    const backups = [
      {
        fileName: 'full.sql',
        companyId: 3,
        type: 'full',
        companyName: 'Source',
      },
    ];
    global.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      if (url === '/api/companies') {
        return { ok: true, json: async () => companies };
      }
      if (url === '/api/companies/backups') {
        return { ok: true, json: async () => ({ backups }) };
      }
      if (url === '/api/companies/backups/restore/full') {
        return {
          ok: true,
          json: async () => ({ summary: { tables: [{ tableName: 'orders' }] } }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const reactMock = createReactStub(states, setters, indexRef);

    const { default: CompaniesPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Companies.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          createElement: reactMock.createElement,
        },
        'react-router-dom': { useNavigate: () => () => {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useModules.js': { useModules: () => [] },
        '../utils/modulePath.js': { default: () => '' },
      },
    );

    function render() {
      indexRef.current = 0;
      return CompaniesPage();
    }

    render();
    await Promise.resolve();
    // set backup target selection
    if (setters[5]) {
      setters[5]({ 'full.sql': String(companies[0].id) });
    }
    const tree = render();

    const restoreButton = findNode(
      tree,
      (node) =>
        node.type === 'button' &&
        node.props?.children?.includes('Restore') &&
        node.props?.onClick,
    );
    assert.ok(restoreButton, 'Restore button not found');
    await restoreButton.props.onClick();

    const restoreCall = fetchCalls.find((call) =>
      call.url === '/api/companies/backups/restore/full',
    );
    assert.ok(restoreCall, 'Full restore endpoint not called');
    const payload = JSON.parse(restoreCall.options?.body || '{}');
    assert.equal(payload.type, 'full');

    delete global.fetch;
  });
}

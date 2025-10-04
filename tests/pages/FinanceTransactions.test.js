import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test(
    'FinanceTransactions shows date controls when parameters include dates',
    { skip: true },
    () => {},
  );
  test(
    'FinanceTransactions hides date controls when parameters omit dates',
    { skip: true },
    () => {},
  );
} else {
  function createReactStub(states, setters, indexRef, contextValue) {
    const reactMock = {
      Fragment: Symbol.for('react.fragment'),
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
      useRef(initial) {
        const idx = indexRef.current;
        if (states.length <= idx) {
          states[idx] = { current: initial };
        }
        indexRef.current += 1;
        return states[idx];
      },
      useEffect(fn) {
        fn();
      },
      useMemo(fn) {
        return fn();
      },
      useContext() {
        return contextValue;
      },
      createElement(type, props, ...children) {
        if (type === reactMock.Fragment) {
          return children;
        }
        if (typeof type === 'function') {
          return type({ ...(props || {}), children });
        }
        return { type, props: { ...(props || {}), children } };
      },
    };

    return reactMock;
  }

  function collectNodes(node, predicate, results = []) {
    if (!node) return results;
    if (Array.isArray(node)) {
      node.forEach((child) => collectNodes(child, predicate, results));
      return results;
    }
    if (typeof node !== 'object') return results;
    if (predicate(node)) {
      results.push(node);
    }
    const children = node.props?.children;
    if (children) {
      const list = Array.isArray(children) ? children : [children];
      list.forEach((child) => collectNodes(child, predicate, results));
    }
    return results;
  }

  function hasOptionWithValue(node, value) {
    return (
      collectNodes(node, (child) => child.type === 'option' && child.props?.value === value)
        .length > 0
    );
  }

  test('FinanceTransactions shows date controls when parameters include dates', async () => {
    global.fetch = async (url) => {
      if (url.includes('moduleKey=finance_transactions')) {
        return {
          ok: true,
          json: async () => ({
            WithDates: {
              moduleKey: 'finance_transactions',
              table: 'finance_table',
              procedures: ['proc_with_dates'],
              allowedBranches: [],
              allowedDepartments: [],
            },
          }),
        };
      }
      if (url.includes('/api/transaction_forms?table=finance_table&name=WithDates')) {
        return {
          ok: true,
          json: async () => ({
            moduleKey: 'finance_transactions',
            table: 'finance_table',
            procedures: ['proc_with_dates'],
          }),
        };
      }
      if (url.includes('/api/procedures/proc_with_dates/params')) {
        return {
          ok: true,
          json: async () => ({ parameters: ['StartDate', 'EndDate'] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const contextValue = {
      company: 1,
      branch: 'BR-1',
      department: 'DEP-1',
      user: { empid: 'EMP-1' },
      permissions: { finance_transactions: true },
    };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const sessionStore = { current: {} };
    const searchParamsState = { current: new URLSearchParams() };

    const { default: FinanceTransactionsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/FinanceTransactions.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useRef: reactMock.useRef,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        'react-router-dom': {
          useSearchParams: () => [
            searchParamsState.current,
            (update) => {
              if (typeof update === 'function') {
                const next = update(searchParamsState.current);
                if (next instanceof URLSearchParams) {
                  searchParamsState.current = next;
                }
              } else if (update instanceof URLSearchParams) {
                searchParamsState.current = update;
              } else if (update) {
                searchParamsState.current = new URLSearchParams(update);
              }
            },
          ],
        },
        '../components/TableManager.jsx': { default: () => null },
        '../components/ReportTable.jsx': { default: () => null },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../context/TxnSessionContext.jsx': {
          useTxnSession: () => [
            sessionStore.current,
            (value) => {
              sessionStore.current =
                typeof value === 'function' ? value(sessionStore.current) : value;
            },
          ],
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../hooks/useCompanyModules.js': {
          useCompanyModules: () => ({ finance_transactions: true }),
        },
        '../components/CustomDatePicker.jsx': {
          default: (props) => ({ type: 'CustomDatePicker', props }),
        },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return FinanceTransactionsPage({ moduleKey: 'finance_transactions' });
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const transactionSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, 'WithDates'),
    )[0];
    assert.ok(transactionSelect, 'Transaction select not found');

    transactionSelect.props.onChange({ target: { value: 'WithDates' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, 'proc_with_dates'),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'proc_with_dates' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const selects = collectNodes(tree, (node) => node.type === 'select');
    assert.equal(selects.length, 3, 'Preset select should appear when date params exist');

    const presetSelect = selects.find((node) => hasOptionWithValue(node, 'custom'));
    assert.ok(presetSelect, 'Preset select missing');

    const datePickers = collectNodes(tree, (node) => node.type === 'CustomDatePicker');
    assert.equal(datePickers.length, 2, 'Both date pickers should render');

    const manualDateInputs = collectNodes(
      tree,
      (node) => node.type === 'input' && /StartDate|EndDate/.test(node.props?.placeholder || ''),
    );
    assert.equal(manualDateInputs.length, 0, 'Manual date inputs should be hidden');

    delete global.fetch;
  });

  test('FinanceTransactions hides date controls when parameters omit dates', async () => {
    global.fetch = async (url) => {
      if (url.includes('moduleKey=finance_transactions')) {
        return {
          ok: true,
          json: async () => ({
            WithoutDates: {
              moduleKey: 'finance_transactions',
              table: 'finance_table',
              procedures: ['proc_without_dates'],
              allowedBranches: [],
              allowedDepartments: [],
            },
          }),
        };
      }
      if (url.includes('/api/transaction_forms?table=finance_table&name=WithoutDates')) {
        return {
          ok: true,
          json: async () => ({
            moduleKey: 'finance_transactions',
            table: 'finance_table',
            procedures: ['proc_without_dates'],
          }),
        };
      }
      if (url.includes('/api/procedures/proc_without_dates/params')) {
        return {
          ok: true,
          json: async () => ({ parameters: ['BranchId'] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const contextValue = {
      company: 1,
      branch: 'BR-2',
      department: 'DEP-2',
      user: { empid: 'EMP-2' },
      permissions: { finance_transactions: true },
    };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const sessionStore = { current: {} };
    const searchParamsState = { current: new URLSearchParams() };

    const { default: FinanceTransactionsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/FinanceTransactions.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useRef: reactMock.useRef,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        'react-router-dom': {
          useSearchParams: () => [
            searchParamsState.current,
            (update) => {
              if (typeof update === 'function') {
                const next = update(searchParamsState.current);
                if (next instanceof URLSearchParams) {
                  searchParamsState.current = next;
                }
              } else if (update instanceof URLSearchParams) {
                searchParamsState.current = update;
              } else if (update) {
                searchParamsState.current = new URLSearchParams(update);
              }
            },
          ],
        },
        '../components/TableManager.jsx': { default: () => null },
        '../components/ReportTable.jsx': { default: () => null },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../context/TxnSessionContext.jsx': {
          useTxnSession: () => [
            sessionStore.current,
            (value) => {
              sessionStore.current =
                typeof value === 'function' ? value(sessionStore.current) : value;
            },
          ],
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../hooks/useCompanyModules.js': {
          useCompanyModules: () => ({ finance_transactions: true }),
        },
        '../components/CustomDatePicker.jsx': {
          default: (props) => ({ type: 'CustomDatePicker', props }),
        },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return FinanceTransactionsPage({ moduleKey: 'finance_transactions' });
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const transactionSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, 'WithoutDates'),
    )[0];
    assert.ok(transactionSelect, 'Transaction select not found');

    transactionSelect.props.onChange({ target: { value: 'WithoutDates' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, 'proc_without_dates'),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'proc_without_dates' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const presetSelects = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, 'custom'),
    );
    assert.equal(presetSelects.length, 0, 'Preset select should be hidden');

    const datePickers = collectNodes(tree, (node) => node.type === 'CustomDatePicker');
    assert.equal(datePickers.length, 0, 'Date pickers should not render');

    delete global.fetch;
  });
}

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('Reports shows date controls when parameters include dates', { skip: true }, () => {});
  test('Reports hides date controls when parameters omit dates', { skip: true }, () => {});
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

  test('Reports shows date controls when parameters include dates', async () => {
    global.fetch = async (url) => {
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({ procedures: [{ name: 'report_with_dates' }] }),
        };
      }
      if (url.startsWith('/api/procedures/report_with_dates/params')) {
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
    const contextValue = { company: 1, branch: 2, department: 3, user: { empid: 4 } };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/CustomDatePicker.jsx': {
          default: (props) => ({ type: 'CustomDatePicker', props }),
        },
        '../components/ReportTable.jsx': { default: () => null },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, ''),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_with_dates' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const selects = collectNodes(tree, (node) => node.type === 'select');
    assert.equal(selects.length, 2, 'Expected both procedure and preset selects');

    const presetSelect = selects.find(
      (node) => !hasOptionWithValue(node, '') && hasOptionWithValue(node, 'custom'),
    );
    assert.ok(presetSelect, 'Preset select not rendered');

    const datePickers = collectNodes(tree, (node) => node.type === 'CustomDatePicker');
    assert.equal(datePickers.length, 2, 'Expected two date pickers to render');

    const manualDateInputs = collectNodes(
      tree,
      (node) => node.type === 'input' && /StartDate|EndDate/.test(node.props?.placeholder || ''),
    );
    assert.equal(manualDateInputs.length, 0, 'Manual date inputs should be hidden');

    delete global.fetch;
  });

  test('Reports hides date controls when parameters omit dates', async () => {
    global.fetch = async (url) => {
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({ procedures: [{ name: 'report_without_dates' }] }),
        };
      }
      if (url.startsWith('/api/procedures/report_without_dates/params')) {
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
    const contextValue = { company: 1, branch: 'B-1', department: null, user: { empid: null } };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/CustomDatePicker.jsx': {
          default: (props) => ({ type: 'CustomDatePicker', props }),
        },
        '../components/ReportTable.jsx': { default: () => null },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, ''),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_without_dates' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const selects = collectNodes(tree, (node) => node.type === 'select');
    assert.equal(selects.length, 1, 'Preset select should be hidden when no date params');

    const datePickers = collectNodes(tree, (node) => node.type === 'CustomDatePicker');
    assert.equal(datePickers.length, 0, 'Date pickers should not render without date params');

    delete global.fetch;
  });
}

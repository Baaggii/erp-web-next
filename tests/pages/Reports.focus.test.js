import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('focus moves to the first parameter control when a procedure is selected', { skip: true }, () => {});
  test('pressing Enter advances through controls and runs the report on the last control', { skip: true }, () => {});
} else {
  function createReactStub(states, setters, refs, stateIndexRef, refIndexRef, contextValue, focusTracker) {
    const reactMock = {
      Fragment: Symbol.for('react.fragment'),
      useState(initial) {
        const idx = stateIndexRef.current;
        if (states.length <= idx) {
          states[idx] = initial;
        }
        const setter = (value) => {
          states[idx] = typeof value === 'function' ? value(states[idx]) : value;
        };
        setters[idx] = setter;
        stateIndexRef.current += 1;
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
      useRef(initial) {
        const idx = refIndexRef.current;
        if (refs.length <= idx) {
          refs[idx] = { current: initial ?? null };
        }
        const ref = refs[idx];
        refIndexRef.current += 1;
        return ref;
      },
      createElement(type, props, ...children) {
        if (type === reactMock.Fragment) {
          return children;
        }
        if (typeof type === 'function') {
          return type({ ...(props || {}), children });
        }
        const node = {
          type,
          props: { ...(props || {}), children },
          focus() {
            focusTracker.current = node;
          },
        };
        if (node.props && Object.prototype.hasOwnProperty.call(node.props, 'ref')) {
          const ref = node.props.ref;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref && typeof ref === 'object') {
            ref.current = node;
          }
          delete node.props.ref;
        }
        return node;
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

  test('focus moves to the first parameter control when a procedure is selected', async () => {
    global.fetch = async (url) => {
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({ procedures: [{ name: 'report_focus' }] }),
        };
      }
      if (url.startsWith('/api/procedures/report_focus/params')) {
        return {
          ok: true,
          json: async () => ({ parameters: ['StartDate', 'EndDate'] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const refs = [];
    const stateIndexRef = { current: 0 };
    const refIndexRef = { current: 0 };
    const focusTracker = { current: null };
    const contextValue = { company: 1, branch: 2, department: 3, user: { empid: 4 } };

    const reactMock = createReactStub(
      states,
      setters,
      refs,
      stateIndexRef,
      refIndexRef,
      contextValue,
      focusTracker,
    );

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          useRef: reactMock.useRef,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/ReportTable.jsx': { default: () => null },
        '../components/CustomDatePicker.jsx': {
          default: (props) => {
            const node = {
              type: 'input',
              props: { type: 'date', ...props },
              focus() {
                focusTracker.current = node;
              },
            };
            if (props.inputRef && typeof props.inputRef === 'object') {
              props.inputRef.current = node;
            }
            delete node.props.inputRef;
            return node;
          },
        },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      stateIndexRef.current = 0;
      refIndexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && node.props.value === '',
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_focus' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const presetSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && node.props.value === 'custom',
    )[0];
    assert.ok(presetSelect, 'Preset select not rendered');

    assert.equal(focusTracker.current, presetSelect);

    delete global.fetch;
    mock.restoreAll();
  });

  test('pressing Enter advances through controls and runs the report on the last control', async () => {
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({ procedures: [{ name: 'report_focus' }] }),
        };
      }
      if (url.startsWith('/api/procedures/report_focus/params')) {
        return {
          ok: true,
          json: async () => ({ parameters: ['StartDate', 'EndDate', 'ManualValue'] }),
        };
      }
      if (url.startsWith('/api/procedures')) {
        return {
          ok: true,
          json: async () => ({ row: [] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const refs = [];
    const stateIndexRef = { current: 0 };
    const refIndexRef = { current: 0 };
    const focusTracker = { current: null };
    const contextValue = { company: 1, branch: 2, department: 3, user: { empid: 4 } };

    const reactMock = createReactStub(
      states,
      setters,
      refs,
      stateIndexRef,
      refIndexRef,
      contextValue,
      focusTracker,
    );

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          useRef: reactMock.useRef,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/ReportTable.jsx': { default: () => null },
        '../components/CustomDatePicker.jsx': {
          default: (props) => {
            const node = {
              type: 'input',
              props: { type: 'date', ...props },
              focus() {
                focusTracker.current = node;
              },
            };
            if (props.inputRef && typeof props.inputRef === 'object') {
              props.inputRef.current = node;
            }
            delete node.props.inputRef;
            return node;
          },
        },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      stateIndexRef.current = 0;
      refIndexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && node.props.value === '',
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_focus' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const presetSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && node.props.value === 'custom',
    )[0];
    assert.ok(presetSelect, 'Preset select not rendered');

    const dateInputs = collectNodes(
      tree,
      (node) => node.type === 'input' && node.props.type === 'date',
    );
    assert.equal(dateInputs.length, 2, 'Expected two date pickers');
    const [startDateInput, endDateInput] = dateInputs;

    const manualInput = collectNodes(
      tree,
      (node) => node.type === 'input' && node.props.placeholder === 'ManualValue',
    )[0];
    assert.ok(manualInput, 'Manual input not rendered');

    const runButton = collectNodes(
      tree,
      (node) => node.type === 'button' && node.props.children === 'Run',
    )[0];
    assert.ok(runButton, 'Run button not rendered');

    assert.equal(focusTracker.current, presetSelect);

    const preventDefault = () => {};

    presetSelect.props.onKeyDown({ key: 'Enter', preventDefault });
    assert.equal(focusTracker.current, startDateInput);

    startDateInput.props.onChange('2024-01-01');
    startDateInput.props.onKeyDown({ key: 'Enter', preventDefault });
    assert.equal(focusTracker.current, endDateInput);

    endDateInput.props.onChange('2024-01-02');
    endDateInput.props.onKeyDown({ key: 'Enter', preventDefault });
    assert.equal(focusTracker.current, manualInput);

    manualInput.props.onChange({ target: { value: 'ready' } });
    manualInput.props.onKeyDown({ key: 'Enter', preventDefault });
    assert.equal(focusTracker.current, runButton);

    const previousPostCalls = fetchCalls.filter((call) => call.options?.method === 'POST').length;
    runButton.props.onKeyDown({ key: 'Enter', preventDefault });
    await Promise.resolve();
    const postCalls = fetchCalls.filter((call) => call.options?.method === 'POST');
    assert.equal(postCalls.length, previousPostCalls + 1);

    delete global.fetch;
    mock.restoreAll();
  });
}

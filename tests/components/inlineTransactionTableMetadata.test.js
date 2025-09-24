import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

function createReactMock() {
  const stateStore = [];
  const stateSetters = [];
  const effectStore = [];
  const memoStore = [];
  const refStore = [];
  let componentRef = null;
  let propsRef = null;
  let tree = null;
  let stateIndex = 0;
  let effectIndex = 0;
  let memoIndex = 0;
  let refIndex = 0;
  let pendingEffects = [];

  function resetIndices() {
    stateIndex = 0;
    effectIndex = 0;
    memoIndex = 0;
    refIndex = 0;
  }

  function runEffects() {
    while (pendingEffects.length) {
      const index = pendingEffects.shift();
      const effect = effectStore[index];
      if (!effect) continue;
      if (typeof effect.cleanup === 'function') {
        try {
          effect.cleanup();
        } catch {}
      }
      const result = effect.fn();
      effect.cleanup = typeof result === 'function' ? result : undefined;
    }
  }

  const ReactMock = { Fragment: Symbol('Fragment') };

  ReactMock.createElement = function createElement(type, props, ...children) {
    const flat = [];
    children.forEach((child) => {
      if (Array.isArray(child)) {
        child.forEach((c) => {
          if (c !== null && c !== undefined && c !== false) flat.push(c);
        });
      } else if (child !== null && child !== undefined && child !== false) {
        flat.push(child);
      }
    });
    if (typeof type === 'function') {
      return type({ ...(props || {}), children: flat });
    }
    if (type === ReactMock.Fragment) {
      return { type: 'fragment', props: props || {}, children: flat };
    }
    return { type, props: props || {}, children: flat };
  };

  ReactMock.useState = function useState(initial) {
    const index = stateIndex++;
    if (!(index in stateStore)) {
      stateStore[index] =
        typeof initial === 'function' ? initial() : initial;
      stateSetters[index] = (value) => {
        const next = typeof value === 'function' ? value(stateStore[index]) : value;
        if (!Object.is(next, stateStore[index])) {
          stateStore[index] = next;
          ReactMock.__render(componentRef, propsRef);
        }
      };
    }
    return [stateStore[index], stateSetters[index]];
  };

  ReactMock.useEffect = function useEffect(fn, deps) {
    const index = effectIndex++;
    const prev = effectStore[index];
    const depsArray = deps ?? null;
    const changed =
      !prev ||
      !depsArray ||
      !prev.deps ||
      depsArray.length !== prev.deps.length ||
      depsArray.some((d, i) => !Object.is(d, prev.deps[i]));
    effectStore[index] = {
      fn,
      deps: depsArray,
      cleanup: prev?.cleanup,
    };
    if (changed) pendingEffects.push(index);
  };

  ReactMock.useMemo = function useMemo(fn, deps) {
    const index = memoIndex++;
    const prev = memoStore[index];
    const depsArray = deps ?? null;
    const changed =
      !prev ||
      !depsArray ||
      !prev.deps ||
      depsArray.length !== prev.deps.length ||
      depsArray.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) {
      memoStore[index] = { value: fn(), deps: depsArray };
    }
    return memoStore[index].value;
  };

  ReactMock.useCallback = function useCallback(fn, deps) {
    return ReactMock.useMemo(() => fn, deps);
  };

  ReactMock.useRef = function useRef(initial) {
    const index = refIndex++;
    if (!(index in refStore)) {
      refStore[index] = { current: initial };
    }
    return refStore[index];
  };

  ReactMock.useImperativeHandle = function useImperativeHandle(ref, createHandle, deps) {
    ReactMock.useEffect(() => {
      if (!ref) return undefined;
      ref.current = createHandle();
      return undefined;
    }, deps);
  };

  ReactMock.forwardRef = function forwardRef(renderFn) {
    return function ForwardRefComponent(props = {}) {
      const { ref, ...rest } = props;
      return renderFn(rest, ref);
    };
  };

  ReactMock.memo = function memo(Component) {
    return (props) => Component(props);
  };

  ReactMock.__render = function __render(Component, props) {
    componentRef = Component;
    propsRef = props;
    resetIndices();
    pendingEffects = [];
    tree = Component(props);
    runEffects();
    return tree;
  };

  ReactMock.__findByTestId = function __findByTestId(id, node = tree) {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.['data-testid'] === id) return node;
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = ReactMock.__findByTestId(id, child);
        if (found) return found;
      }
    }
    return null;
  };

  return {
    module: {
      default: ReactMock,
      Fragment: ReactMock.Fragment,
      createElement: ReactMock.createElement,
      useState: ReactMock.useState,
      useEffect: ReactMock.useEffect,
      useMemo: ReactMock.useMemo,
      useCallback: ReactMock.useCallback,
      useRef: ReactMock.useRef,
      useImperativeHandle: ReactMock.useImperativeHandle,
      forwardRef: ReactMock.forwardRef,
      memo: ReactMock.memo,
    },
    render: ReactMock.__render,
    findByTestId: ReactMock.__findByTestId,
    getTree: () => tree,
  };
}

function findByType(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findByType(child, type);
      if (found) return found;
    }
  }
  return null;
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

const noop = () => {};

if (!global.window) global.window = {};
if (!global.window.addEventListener) global.window.addEventListener = noop;
if (!global.window.removeEventListener) global.window.removeEventListener = noop;
if (!global.window.dispatchEvent) global.window.dispatchEvent = noop;
if (typeof global.CustomEvent !== 'function') {
  global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
}
if (!global.window.CustomEvent) global.window.CustomEvent = global.CustomEvent;
if (!global.document) {
  global.document = { createElement: () => ({}) };
} else if (!global.document.createElement) {
  global.document.createElement = () => ({});
}

if (typeof mock?.import !== 'function') {
  test('InlineTransactionTable preserves array metadata during edits', { skip: true }, () => {});
} else {
  test('InlineTransactionTable preserves array metadata during edits', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const initRows = [{ qty: '1' }];
    initRows.session_id = 'sess-001';
    initRows.branch_id = 'branch-22';

    const onRowsChangeCalls = [];
    const onRowsChange = (rows) => {
      onRowsChangeCalls.push(rows);
    };

    const tableRef = { current: null };

    const { default: InlineTransactionTable } = await mock.import(
      '../../src/erp.mgt.mn/components/InlineTransactionTable.jsx',
      {
        react: reactMock.module,
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        './AsyncSearchSelect.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './RowImageUploadModal.jsx': { default: () => null },
        '../utils/buildImageName.js': { default: () => ({ name: '' }) },
        '../utils/slugify.js': { default: (value) => String(value) },
        '../utils/formatTimestamp.js': { default: () => '2024-01-01 00:00:00' },
        '../utils/callProcedure.js': { default: async () => ({}) },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    try {
      reactMock.render(InlineTransactionTable, {
        ref: tableRef,
        fields: ['qty'],
        labels: { qty: 'Qty' },
        rows: initRows,
        defaultValues: {},
        onRowsChange,
        minRows: 1,
        relations: {},
        relationConfigs: {},
        relationData: {},
        fieldTypeMap: {},
        totalAmountFields: [],
        totalCurrencyFields: [],
        columnCaseMap: {},
        viewSource: {},
        viewDisplays: {},
        viewColumns: {},
        loadView: noop,
        procTriggers: {},
        user: {},
        collectRows: false,
      });

      await flushPromises();
      await flushPromises();

      assert.ok(tableRef.current);
      const mountedRows = tableRef.current.getRows();
      assert.equal(mountedRows.session_id, 'sess-001');
      assert.equal(mountedRows.branch_id, 'branch-22');

      const tree = reactMock.getTree();
      const inputNode = findByType(tree, 'textarea') || findByType(tree, 'input');
      assert.ok(inputNode, 'input element should be rendered');
      inputNode.props.onChange({ target: { value: '2' } });

      await flushPromises();

      const editedRows = tableRef.current.getRows();
      assert.equal(editedRows.session_id, 'sess-001');
      assert.equal(editedRows.branch_id, 'branch-22');
      assert.equal(editedRows[0].qty, '2');

      assert.ok(onRowsChangeCalls.length > 0);
      const lastCall = onRowsChangeCalls[onRowsChangeCalls.length - 1];
      assert.equal(lastCall.session_id, 'sess-001');
      assert.equal(lastCall.branch_id, 'branch-22');
      assert.equal(lastCall[0].qty, '2');
    } finally {
      global.fetch = originalFetch;
    }
  });
}

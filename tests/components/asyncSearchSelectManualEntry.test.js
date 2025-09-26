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

  ReactMock.useLayoutEffect = ReactMock.useEffect;

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

  ReactMock.useContext = function useContext(context) {
    if (context && typeof context === 'object') {
      if ('_currentValue' in context) return context._currentValue;
      if ('_currentValue2' in context) return context._currentValue2;
    }
    return undefined;
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

  return {
    module: {
      default: ReactMock,
      Fragment: ReactMock.Fragment,
      createElement: ReactMock.createElement,
      useState: ReactMock.useState,
      useEffect: ReactMock.useEffect,
      useLayoutEffect: ReactMock.useLayoutEffect,
      useMemo: ReactMock.useMemo,
      useCallback: ReactMock.useCallback,
      useRef: ReactMock.useRef,
      useContext: ReactMock.useContext,
      useImperativeHandle: ReactMock.useImperativeHandle,
      forwardRef: ReactMock.forwardRef,
      memo: ReactMock.memo,
    },
    render: ReactMock.__render,
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

if (typeof mock?.import !== 'function') {
  test('AsyncSearchSelect preserves manual input when pressing Enter', { skip: true }, () => {});
} else {
  test('AsyncSearchSelect preserves manual input when pressing Enter', async () => {
    const reactMock = createReactMock();

    const originalFetch = global.fetch;
    const originalWindow = global.window;
    const originalDocument = global.document;

    const windowStub = originalWindow ?? {};
    const prevAddEventListener = windowStub.addEventListener;
    const prevRemoveEventListener = windowStub.removeEventListener;
    const prevDispatchEvent = windowStub.dispatchEvent;
    windowStub.addEventListener = windowStub.addEventListener || (() => {});
    windowStub.removeEventListener = windowStub.removeEventListener || (() => {});
    windowStub.dispatchEvent = windowStub.dispatchEvent || (() => {});
    global.window = windowStub;

    const documentStub = originalDocument ?? {};
    const prevCreateElement = documentStub.createElement;
    const prevBody = documentStub.body;
    documentStub.createElement = documentStub.createElement || (() => ({}));
    documentStub.body = documentStub.body || {};
    global.document = documentStub;

    const fetchStub = mock.fn(async (url) => {
      if (String(url).startsWith('/api/tenant_tables/')) {
        return { ok: true, json: async () => ({}) };
      }
      if (String(url).startsWith('/api/tables/')) {
        return {
          json: async () => ({
            rows: [
              { id: '1', name: 'First Option' },
              { id: '2', name: 'Second Option' },
            ],
            count: 2,
          }),
        };
      }
      throw new Error(`Unhandled fetch URL: ${url}`);
    });
    global.fetch = fetchStub;

    const AuthContextMock = {
      _currentValue: { company: null, branch: null, department: null },
    };

    const { default: AsyncSearchSelect } = await mock.import(
      '../../src/erp.mgt.mn/components/AsyncSearchSelect.jsx',
      {
        react: reactMock.module,
        'react-dom': { createPortal: (node) => node },
        '../context/AuthContext.jsx': { AuthContext: AuthContextMock },
        '../utils/tenantKeys.js': { getTenantKeyList: () => [] },
      },
    );

    const onChangeCalls = [];

    try {
      reactMock.render(AsyncSearchSelect, {
        table: 'items',
        searchColumn: 'name',
        labelFields: ['name'],
        idField: 'id',
        value: '',
        onChange: (...args) => {
          onChangeCalls.push(args);
        },
      });

      await flushPromises();
      await flushPromises();

      let tree = reactMock.getTree();
      const inputNode = findByType(tree, 'input');
      assert.ok(inputNode, 'input element should render');

      const mockInput = {
        value: '',
        style: {},
        scrollWidth: 80,
        getBoundingClientRect: () => ({ bottom: 10, left: 5, width: 120 }),
      };
      if (typeof inputNode.props.ref === 'function') {
        inputNode.props.ref(mockInput);
      }

      inputNode.props.onFocus({ target: mockInput });

      await flushPromises();

      tree = reactMock.getTree();
      const focusedInput = findByType(tree, 'input');
      assert.ok(focusedInput, 'focused input should exist');

      focusedInput.props.onChange({
        target: {
          value: 'Custom Value',
          style: mockInput.style,
          scrollWidth: 90,
        },
      });

      await flushPromises();

      tree = reactMock.getTree();
      const changedInput = findByType(tree, 'input');
      assert.equal(changedInput.props.value, 'Custom Value');

      const enterEvent = {
        key: 'Enter',
        target: mockInput,
        preventDefault: mock.fn(),
      };
      changedInput.props.onKeyDown(enterEvent);

      await flushPromises();

      tree = reactMock.getTree();
      const finalInput = findByType(tree, 'input');
      assert.equal(finalInput.props.value, 'Custom Value');

      assert.deepEqual(
        onChangeCalls.map((args) => args[0]),
        ['Custom Value'],
        'onChange should only receive the manually entered value',
      );
    } finally {
      global.fetch = originalFetch;
      windowStub.addEventListener = prevAddEventListener;
      windowStub.removeEventListener = prevRemoveEventListener;
      windowStub.dispatchEvent = prevDispatchEvent;
      if (originalWindow === undefined) {
        delete global.window;
      } else {
        global.window = originalWindow;
      }
      documentStub.createElement = prevCreateElement;
      documentStub.body = prevBody;
      if (originalDocument === undefined) {
        delete global.document;
      } else {
        global.document = originalDocument;
      }
    }
  });
}

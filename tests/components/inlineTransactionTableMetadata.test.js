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

function findAllByType(node, type, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (node.type === type) result.push(node);
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => findAllByType(child, type, result));
  }
  return result;
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

  test('InlineTransactionTable applies procedure results to header fields', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));
    const callProcedureMock = mock.fn(async () => ({ HeaderField: 'HDR-001' }));

    const tableRef = { current: null };
    const onRowsChange = mock.fn(() => {});

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
        '../utils/callProcedure.js': { default: callProcedureMock },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    try {
      reactMock.render(InlineTransactionTable, {
        ref: tableRef,
        fields: ['ItemCode'],
        allFields: ['HeaderField', 'ItemCode'],
        labels: { ItemCode: 'Item' },
        rows: [{ ItemCode: '' }],
        defaultValues: {},
        onRowsChange,
        minRows: 1,
        relations: {},
        relationConfigs: {},
        relationData: {},
        fieldTypeMap: {},
        totalAmountFields: [],
        totalCurrencyFields: [],
        columnCaseMap: { itemcode: 'ItemCode', headerfield: 'HeaderField' },
        viewSource: {},
        viewDisplays: {},
        viewColumns: {},
        loadView: noop,
        procTriggers: {
          itemcode: {
            name: 'set_header',
            params: ['$current'],
            outMap: { '$current': 'HeaderField' },
          },
        },
        user: {},
        collectRows: false,
      });

      await flushPromises();
      await flushPromises();

      const initialTree = reactMock.getTree();
      let inputNode = findByType(initialTree, 'input');
      assert.ok(inputNode, 'input element should be rendered');

      inputNode.props.onChange({ target: { value: 'ITEM-01' } });
      await flushPromises();

      const updatedTree = reactMock.getTree();
      inputNode = findByType(updatedTree, 'input');
      assert.ok(inputNode, 'input element should be rendered after update');

      const event = {
        key: 'Enter',
        preventDefault: () => {},
        target: {
          value: 'ITEM-01',
          focus: () => {},
          select: () => {},
        },
      };
      inputNode.props.onKeyDown(event);

      await flushPromises();
      await flushPromises();

      assert.equal(callProcedureMock.mock.callCount(), 1);
      const [procName, params] = callProcedureMock.mock.calls[0].arguments;
      assert.equal(procName, 'set_header');
      assert.deepEqual(params, ['ITEM-01']);

      assert.ok(tableRef.current, 'table ref should be populated');
      const rows = tableRef.current.getRows();
      assert.equal(rows[0].HeaderField, 'HDR-001');
      assert.equal(rows.HeaderField, 'HDR-001');

      assert.ok(onRowsChange.mock.callCount() > 0, 'onRowsChange should be called');
      const lastCall = onRowsChange.mock.calls[onRowsChange.mock.calls.length - 1];
      assert.ok(lastCall, 'onRowsChange should record the latest call');
      const [changedRows] = lastCall.arguments;
      assert.ok(changedRows, 'onRowsChange should provide rows data');
      assert.equal(changedRows.HeaderField, 'HDR-001');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('InlineTransactionTable cascades procedure triggers sequentially', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));

    const callProcedureMock = mock.fn(async (name, params) => {
      if (name === 'fill_intermediate') {
        return { IntermediateField: 'MID-100' };
      }
      if (name === 'fill_final') {
        return { FinalField: `FIN-${params[0]}` };
      }
      return {};
    });

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
        '../utils/callProcedure.js': { default: callProcedureMock },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    try {
      reactMock.render(InlineTransactionTable, {
        ref: tableRef,
        fields: ['ItemCode', 'IntermediateField', 'FinalField'],
        allFields: ['ItemCode', 'IntermediateField', 'FinalField'],
        labels: { ItemCode: 'Item', IntermediateField: 'Intermediate', FinalField: 'Final' },
        rows: [{ ItemCode: '', IntermediateField: '', FinalField: '' }],
        defaultValues: {},
        onRowsChange: () => {},
        minRows: 1,
        relations: {},
        relationConfigs: {},
        relationData: {},
        fieldTypeMap: {},
        totalAmountFields: [],
        totalCurrencyFields: [],
        columnCaseMap: {
          itemcode: 'ItemCode',
          intermediatefield: 'IntermediateField',
          finalfield: 'FinalField',
        },
        viewSource: {},
        viewDisplays: {},
        viewColumns: {},
        loadView: noop,
        procTriggers: {
          itemcode: {
            name: 'fill_intermediate',
            params: ['$current'],
            outMap: { '$current': 'IntermediateField' },
          },
          intermediatefield: {
            name: 'fill_final',
            params: ['$current'],
            outMap: { '$current': 'FinalField' },
          },
        },
        user: {},
        collectRows: false,
      });

      await flushPromises();
      await flushPromises();

      const tree = reactMock.getTree();
      const inputs = findAllByType(tree, 'input');
      assert.ok(inputs.length >= 1, 'should render at least one input');
      const itemInput = inputs[0];

      itemInput.props.onChange({ target: { value: 'ITEM-01' } });
      await flushPromises();

      const event = {
        key: 'Enter',
        preventDefault: () => {},
        target: { value: 'ITEM-01', focus: () => {}, select: () => {} },
      };
      itemInput.props.onKeyDown(event);

      await flushPromises();
      await flushPromises();

      assert.equal(callProcedureMock.mock.callCount(), 2);
      const [firstCall, secondCall] = callProcedureMock.mock.calls.map((c) => c.arguments[0]);
      assert.equal(firstCall, 'fill_intermediate');
      assert.equal(secondCall, 'fill_final');

      assert.ok(tableRef.current, 'table ref should be available');
      const rows = tableRef.current.getRows();
      assert.equal(rows[0].IntermediateField, 'MID-100');
      assert.equal(rows[0].FinalField, 'FIN-MID-100');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('InlineTransactionTable recomputes generated totals for transactions_order', async () => {
    const reactMock = createReactMock();
    const onRowsChange = mock.fn(() => {});

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

    const tableRef = { current: null };

    reactMock.render(InlineTransactionTable, {
      ref: tableRef,
      fields: ['ordrsub', 'sp_cost', 'ordrap'],
      allFields: ['ordrsub', 'sp_cost', 'ordrap'],
      rows: [{ ordrsub: '1', sp_cost: '10', ordrap: '10' }],
      defaultValues: {},
      onRowsChange,
      minRows: 1,
      relations: {},
      relationConfigs: {},
      relationData: {},
      fieldTypeMap: { ordrsub: 'number', sp_cost: 'number', ordrap: 'number' },
      totalAmountFields: [],
      totalCurrencyFields: ['ordrap'],
      columnCaseMap: { ordrsub: 'ordrsub', sp_cost: 'sp_cost', ordrap: 'ordrap' },
      viewSource: {},
      viewDisplays: {},
      viewColumns: {},
      loadView: noop,
      procTriggers: {},
      user: {},
      tableColumns: [
        { name: 'ordrsub' },
        { name: 'sp_cost' },
        {
          name: 'ordrap',
          generationExpression: 'IFNULL(`ordrsub`,0) * IFNULL(`sp_cost`,0)',
        },
      ],
      collectRows: true,
      tableName: 'transactions_order',
    });

    const tree = reactMock.getTree();
    const inputs = findAllByType(tree, 'input');
    assert.equal(inputs.length >= 2, true, 'should render quantity and cost inputs');

    // ordrsub field
    inputs[0].props.onChange({ target: { value: '5' } });
    // sp_cost field
    inputs[1].props.onChange({ target: { value: '20' } });

    const lastCall = onRowsChange.mock.calls[onRowsChange.mock.calls.length - 1];
    assert.ok(lastCall, 'onRowsChange should be called after edits');
    const [rowsArg] = lastCall.arguments;
    assert.equal(rowsArg[0].ordrap, 100);
    assert.equal(rowsArg.ordrap, 100);
  });

  test('InlineTransactionTable blocks procedure call when required parameters are empty', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));
    const callProcedureMock = mock.fn(async () => ({ HeaderField: 'HDR-001' }));

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
        '../utils/callProcedure.js': { default: callProcedureMock },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    try {
      reactMock.render(InlineTransactionTable, {
        fields: ['SessionDate', 'ItemCode'],
        allFields: ['SessionDate', 'ItemCode'],
        labels: { SessionDate: 'Session Date', ItemCode: 'Item' },
        rows: [{ SessionDate: '', ItemCode: '' }],
        defaultValues: {},
        onRowsChange: () => {},
        minRows: 1,
        relations: {},
        relationConfigs: {},
        relationData: {},
        fieldTypeMap: { SessionDate: 'date' },
        totalAmountFields: [],
        totalCurrencyFields: [],
        columnCaseMap: { sessiondate: 'SessionDate', itemcode: 'ItemCode' },
        viewSource: {},
        viewDisplays: {},
        viewColumns: {},
        loadView: noop,
        procTriggers: {
          itemcode: {
            name: 'set_header',
            params: ['$current', 'SessionDate'],
            outMap: { '$current': 'ItemCode' },
          },
        },
        user: {},
        collectRows: false,
        requiredFields: [],
      });

      await flushPromises();
      await flushPromises();

      let tree = reactMock.getTree();
      let inputs = findAllByType(tree, 'input');
      assert.ok(inputs.length >= 2, 'should render session and item inputs');
      const dateInput = inputs[0];
      const itemInput = inputs[1];

      itemInput.props.onChange({ target: { value: 'ITEM-01' } });
      await flushPromises();

      itemInput.props.onKeyDown({
        key: 'Enter',
        preventDefault: () => {},
        target: {
          value: 'ITEM-01',
          focus: () => {},
          select: () => {},
        },
      });

      await flushPromises();
      await flushPromises();

      assert.equal(callProcedureMock.mock.callCount(), 0, 'procedure should not be called when date missing');

      dateInput.props.onChange({ target: { value: '2024-02-01' } });
      await flushPromises();

      tree = reactMock.getTree();
      inputs = findAllByType(tree, 'input');
      const updatedItemInput = inputs[1];
      updatedItemInput.props.onKeyDown({
        key: 'Enter',
        preventDefault: () => {},
        target: {
          value: 'ITEM-01',
          focus: () => {},
          select: () => {},
        },
      });

      await flushPromises();
      await flushPromises();

      assert.equal(callProcedureMock.mock.callCount(), 1, 'procedure should run after filling required fields');
      const [procName, params] = callProcedureMock.mock.calls[0].arguments;
      assert.equal(procName, 'set_header');
      assert.deepEqual(params, ['ITEM-01', '2024-02-01']);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('InlineTransactionTable resolves procedure params from table metadata', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    const originalDispatch = global.window.dispatchEvent;
    const toastEvents = [];
    global.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));
    const callProcedureMock = mock.fn(async () => ({ sp_selling_price: '125.5000' }));
    global.window.dispatchEvent = (event) => {
      toastEvents.push(event);
    };

    const initRows = [{ sp_selling_code: '' }];
    initRows.company_id = 'COMP-001';
    initRows.bmtr_transbranch = 'BR-009';
    initRows.bmtr_date = '2024-03-15';
    initRows.bmtr_coupcode = 'CP-777';

    const tableRef = { current: null };

    const { default: InlineTransactionTable } = await mock.import(
      '../../src/erp.mgt.mn/components/InlineTransactionTable.jsx',
      {
        react: reactMock.module,
        '../hooks/useGeneralConfig.js': {
          default: () => ({ forms: {}, general: { procToastEnabled: true } }),
        },
        './AsyncSearchSelect.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './RowImageUploadModal.jsx': { default: () => null },
        '../utils/buildImageName.js': { default: () => ({ name: '' }) },
        '../utils/slugify.js': { default: (value) => String(value) },
        '../utils/formatTimestamp.js': { default: () => '2024-01-01 00:00:00' },
        '../utils/callProcedure.js': { default: callProcedureMock },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    try {
      reactMock.render(InlineTransactionTable, {
        ref: tableRef,
        fields: ['sp_selling_code', 'sp_selling_price'],
        allFields: [
          'sp_selling_code',
          'sp_selling_price',
          'company_id',
          'bmtr_transbranch',
          'bmtr_date',
          'bmtr_coupcode',
        ],
        labels: { sp_selling_code: 'Selling Code', sp_selling_price: 'Selling Price' },
        rows: initRows,
        defaultValues: {},
        onRowsChange: () => {},
        minRows: 1,
        relations: {},
        relationConfigs: {},
        relationData: {},
        fieldTypeMap: {},
        totalAmountFields: [],
        totalCurrencyFields: [],
        columnCaseMap: {
          sp_selling_code: 'sp_selling_code',
          sp_selling_price: 'sp_selling_price',
          company_id: 'company_id',
          bmtr_transbranch: 'bmtr_transbranch',
          bmtr_date: 'bmtr_date',
          bmtr_coupcode: 'bmtr_coupcode',
        },
        viewSource: {},
        viewDisplays: {},
        viewColumns: {},
        loadView: noop,
        procTriggers: {
          sp_selling_code: {
            name: 'get_selling_price_and_discount',
            params: [
              '$current',
              'company_id',
              'bmtr_transbranch',
              'bmtr_date',
              'bmtr_coupcode',
            ],
            outMap: {
              '$current': 'sp_selling_code',
              company_id: 'company_id',
              bmtr_transbranch: 'bmtr_transbranch',
              bmtr_date: 'bmtr_date',
              bmtr_coupcode: 'bmtr_coupcode',
              result_price: 'sp_selling_price',
            },
          },
        },
        user: {},
        collectRows: false,
      });

      await flushPromises();
      await flushPromises();

      const tree = reactMock.getTree();
      const inputNode = findByType(tree, 'input') || findByType(tree, 'textarea');
      assert.ok(inputNode, 'selling code input should render');

      inputNode.props.onChange({ target: { value: 'ITEM-001' } });
      await flushPromises();

      inputNode.props.onKeyDown({
        key: 'Enter',
        preventDefault: () => {},
        target: {
          value: 'ITEM-001',
          focus: () => {},
          select: () => {},
        },
      });

      await flushPromises();
      await flushPromises();

      assert.equal(callProcedureMock.mock.callCount(), 1);
      const [procName, params] = callProcedureMock.mock.calls[0].arguments;
      assert.equal(procName, 'get_selling_price_and_discount');
      assert.deepEqual(params, [
        'ITEM-001',
        'COMP-001',
        'BR-009',
        '2024-03-15',
        'CP-777',
      ]);

      assert.ok(tableRef.current, 'table ref should be set');
      const rows = tableRef.current.getRows();
      assert.equal(rows[0].sp_selling_price, '125.5000');

      const toastMessages = toastEvents
        .map((event) => event?.detail?.message)
        .filter(Boolean);
      const procToast = toastMessages.find((msg) =>
        msg.includes('get_selling_price_and_discount'),
      );
      assert.ok(procToast, 'procedure toast should be emitted');
      assert.ok(
        procToast.includes(
          'sp_selling_code -> get_selling_price_and_discount(ITEM-001, COMP-001, BR-009, 2024-03-15, CP-777)',
        ),
        'toast should include resolved parameter values',
      );
    } finally {
      global.fetch = originalFetch;
      global.window.dispatchEvent = originalDispatch;
    }
  });

  test('InlineTransactionTable respects disabledFields for visible columns', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const initRows = [{ code: 'A-01', qty: '2' }];

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
        fields: ['code', 'qty'],
        labels: { code: 'Code', qty: 'Qty' },
        rows: initRows,
        disabledFields: ['code'],
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

      const tree = reactMock.getTree();
      const inputs = findAllByType(tree, 'input');
      assert.equal(inputs.length, 1, 'only editable field should render an input');
      const readonlyCells = findAllByType(tree, 'div').filter((node) =>
        node?.props?.className?.includes('bg-gray-100'),
      );
      assert.ok(
        readonlyCells.some((node) =>
          Array.isArray(node.children)
            ? node.children.includes('A-01')
            : node.children === 'A-01',
        ),
        'disabled field should render readonly content',
      );

      inputs[0].props.onChange({ target: { value: '5' } });

      await flushPromises();

      const rows = tableRef.current.getRows();
      assert.equal(rows[0].code, 'A-01');
      assert.equal(rows[0].qty, '5');
      assert.ok(onRowsChangeCalls.length > 0);
      const lastCall = onRowsChangeCalls[onRowsChangeCalls.length - 1];
      assert.equal(lastCall[0].code, 'A-01');
      assert.equal(lastCall[0].qty, '5');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('InlineTransactionTable passes combination filters to AsyncSearchSelect', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const selectCalls = [];
    const AsyncSearchSelectMock = (props) => {
      selectCalls.push(props);
      return { type: 'async-select', props, children: [] };
    };

    const { default: InlineTransactionTable } = await mock.import(
      '../../src/erp.mgt.mn/components/InlineTransactionTable.jsx',
      {
        react: reactMock.module,
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        './AsyncSearchSelect.jsx': { default: AsyncSearchSelectMock },
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
        fields: ['company_id', 'dept_id'],
        labels: { company_id: 'Company', dept_id: 'Dept' },
        rows: [{ company_id: 'COMP-1', dept_id: '' }],
        disabledFields: [],
        defaultValues: {},
        onRowsChange: () => {},
        minRows: 1,
        relations: {},
        relationConfigs: {
          dept_id: {
            table: 'departments',
            column: 'id',
            idField: 'id',
            combinationSourceColumn: 'company_id',
            combinationTargetColumn: 'company_id',
          },
        },
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

      const deptCall = selectCalls.find((props) => props.table === 'departments');
      assert.ok(deptCall, 'relation AsyncSearchSelect should render');
      assert.deepEqual(deptCall.filters, { company_id: 'COMP-1' });
      assert.deepEqual(deptCall.exactFilters, ['company_id']);
      assert.equal(deptCall.shouldFetch, true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('InlineTransactionTable blocks combination AsyncSearchSelect without source', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const selectCalls = [];
    const AsyncSearchSelectMock = (props) => {
      selectCalls.push(props);
      return { type: 'async-select', props, children: [] };
    };

    const { default: InlineTransactionTable } = await mock.import(
      '../../src/erp.mgt.mn/components/InlineTransactionTable.jsx',
      {
        react: reactMock.module,
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        './AsyncSearchSelect.jsx': { default: AsyncSearchSelectMock },
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
        fields: ['company_id', 'dept_id'],
        labels: { company_id: 'Company', dept_id: 'Dept' },
        rows: [{ company_id: '', dept_id: '' }],
        disabledFields: [],
        defaultValues: {},
        onRowsChange: () => {},
        minRows: 1,
        relations: {},
        relationConfigs: {
          dept_id: {
            table: 'departments',
            column: 'id',
            idField: 'id',
            combinationSourceColumn: 'company_id',
            combinationTargetColumn: 'company_id',
          },
        },
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

      const deptCall = selectCalls.find((props) => props.table === 'departments');
      assert.ok(deptCall, 'relation AsyncSearchSelect should render');
      assert.equal(deptCall.filters, undefined);
      assert.equal(deptCall.exactFilters, undefined);
      assert.equal(deptCall.shouldFetch, false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('InlineTransactionTable filters relation select options using combination targets', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const tableRelations = {
      items: {
        dept_id: {
          table: 'departments',
          column: 'id',
          combinationSourceColumn: 'company_id',
          combinationTargetColumn: 'company_id',
        },
      },
    };

    const { default: InlineTransactionTable } = await mock.import(
      '../../src/erp.mgt.mn/components/InlineTransactionTable.jsx',
      {
        react: reactMock.module,
        '../hooks/useGeneralConfig.js': {
          default: () => ({
            tableRelations,
            general: {},
          }),
        },
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
        tableName: 'items',
        fields: ['company_id', 'dept_id'],
        labels: { company_id: 'Company', dept_id: 'Dept' },
        rows: [{ company_id: 'COMP-1', dept_id: '' }],
        disabledFields: [],
        defaultValues: {},
        onRowsChange: () => {},
        minRows: 1,
        relations: {
          dept_id: [
            { value: '1', label: 'North' },
            { value: '2', label: 'South' },
          ],
        },
        relationConfigs: {},
        relationData: {
          dept_id: {
            '1': { id: '1', company_id: 'COMP-1' },
            '2': { id: '2', company_id: 'COMP-2' },
          },
        },
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

      const tree = reactMock.getTree();
      const selects = findAllByType(tree, 'select');
      assert.ok(selects.length > 0, 'expected select control to render');
      const optionValues = selects[0].children
        .filter((child) => child.type === 'option')
        .map((opt) => opt.props.value);
      assert.deepEqual(optionValues, ['', '1']);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('InlineTransactionTable hides relation options until combination value provided', async () => {
    const reactMock = createReactMock();
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const tableRelations = {
      items: {
        dept_id: {
          table: 'departments',
          column: 'id',
          combinationSourceColumn: 'company_id',
          combinationTargetColumn: 'company_id',
        },
      },
    };

    const { default: InlineTransactionTable } = await mock.import(
      '../../src/erp.mgt.mn/components/InlineTransactionTable.jsx',
      {
        react: reactMock.module,
        '../hooks/useGeneralConfig.js': {
          default: () => ({
            tableRelations,
            general: {},
          }),
        },
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
        tableName: 'items',
        fields: ['company_id', 'dept_id'],
        labels: { company_id: 'Company', dept_id: 'Dept' },
        rows: [{ company_id: '', dept_id: '' }],
        disabledFields: [],
        defaultValues: {},
        onRowsChange: () => {},
        minRows: 1,
        relations: {
          dept_id: [
            { value: '1', label: 'North' },
            { value: '2', label: 'South' },
          ],
        },
        relationConfigs: {},
        relationData: {
          dept_id: {
            '1': { id: '1', company_id: 'COMP-1' },
            '2': { id: '2', company_id: 'COMP-2' },
          },
        },
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

      const tree = reactMock.getTree();
      const selects = findAllByType(tree, 'select');
      assert.ok(selects.length > 0, 'expected select control to render');
      const optionValues = selects[0].children
        .filter((child) => child.type === 'option')
        .map((opt) => opt.props.value);
      assert.deepEqual(optionValues, ['']);
    } finally {
      global.fetch = originalFetch;
    }
  });
}

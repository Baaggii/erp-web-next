import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { fetchTriggersForTables } from '../../src/erp.mgt.mn/utils/fetchTriggersForTables.js';
import { syncCalcFields } from '../../src/erp.mgt.mn/utils/syncCalcFields.js';

if (typeof mock.import !== 'function') {
  test('shouldLoadRelations helper', { skip: true }, () => {});
  test('applySessionIdToTables helper', { skip: true }, () => {});
  test('calc field preflight respects SUM aggregators and multi rows', { skip: true }, () => {});
  test('generated column configs support lowercase generation_expression metadata', { skip: true }, () => {});
} else {
  test('shouldLoadRelations helper', async () => {
    const { shouldLoadRelations } = await mock.import(
      '../../src/erp.mgt.mn/pages/PosTransactions.jsx',
      {},
    );

    const fc1 = { viewSource: {} };
    const cols1 = [{ name: 'id' }, { name: 'name' }];
    assert.equal(shouldLoadRelations(fc1, cols1), false);

    const fc2 = { viewSource: { a: 'viewA' } };
    assert.equal(shouldLoadRelations(fc2, []), true);

    const fc3 = { viewSource: {} };
    const cols3 = [{ name: 'col', REFERENCED_TABLE_NAME: 'ref_tbl' }];
    assert.equal(shouldLoadRelations(fc3, cols3), true);
  });

  test('applySessionIdToTables helper', async () => {
    const { applySessionIdToTables } = await mock.import(
      '../../src/erp.mgt.mn/pages/PosTransactions.jsx',
      {},
    );

    const sessionFieldsByTable = {
      master_tbl: ['pos_session_id'],
      detail_tbl: ['session_id'],
    };
    const tableTypeMap = { master_tbl: 'single', detail_tbl: 'multi' };
    const initial = {
      master_tbl: { name: 'Txn' },
      detail_tbl: [
        { line: 1, qty: 2 },
        { line: 2, qty: 1, session_id: 'old_session' },
      ],
    };
    const sid = 'pos_test';

    const populated = applySessionIdToTables(
      initial,
      sid,
      sessionFieldsByTable,
      tableTypeMap,
    );

    assert.notStrictEqual(populated, initial);
    assert.equal(populated.master_tbl.pos_session_id, sid);
    assert.equal(populated.detail_tbl[0].session_id, sid);
    assert.equal(populated.detail_tbl[1].session_id, sid);
    assert.equal(populated.detail_tbl.session_id, sid);
    assert.equal(initial.detail_tbl[1].session_id, 'old_session');

    const secondPass = applySessionIdToTables(
      populated,
      sid,
      sessionFieldsByTable,
      tableTypeMap,
    );
    assert.strictEqual(secondPass, populated);
  });

  test('new transactions seed session metadata for multi tables', async () => {
    const { applySessionIdToTables } = await mock.import(
      '../../src/erp.mgt.mn/pages/PosTransactions.jsx',
      {},
    );

    const sessionFieldsByTable = {
      detail_tbl: ['session_id', 'pos_session_id'],
    };
    const tableTypeMap = { detail_tbl: 'multi' };
    const initial = { detail_tbl: [] };
    initial.detail_tbl.header_note = 'keep-me';
    initial.detail_tbl.session_id = 'old_session';
    const sid = 'pos_new';

    const populated = applySessionIdToTables(
      initial,
      sid,
      sessionFieldsByTable,
      tableTypeMap,
    );

    assert.notStrictEqual(populated, initial);
    assert.notStrictEqual(populated.detail_tbl, initial.detail_tbl);
    assert.ok(Array.isArray(populated.detail_tbl));
    assert.equal(populated.detail_tbl.length, 0);
    sessionFieldsByTable.detail_tbl.forEach((field) => {
      assert.equal(populated.detail_tbl[field], sid);
    });
    assert.equal(populated.detail_tbl.header_note, 'keep-me');
    assert.equal(initial.detail_tbl.session_id, 'old_session');
    assert.equal(initial.detail_tbl.pos_session_id, undefined);
  });

  test('session field extraction includes grouped calc fields', async () => {
    const {
      extractSessionFieldsFromConfig,
      applySessionIdToTables,
    } = await mock.import('../../src/erp.mgt.mn/pages/PosTransactions.jsx', {});

    const config = {
      calcFields: [
        {
          cells: [
            { table: 'transactions', field: 'pos_session_id' },
            { table: 'transactions_inventory', field: 'bmtr_pid' },
            { table: 'transactions_inventory', field: 'bmtr_session_id' },
          ],
        },
        {
          cells: [{ table: 'transactions_inventory', field: 'non_session_calc' }],
        },
      ],
      posFields: [
        {
          parts: [
            { table: 'transactions', field: 'pos_session_id' },
            { table: 'transactions_payments', field: 'pos_session_id' },
            { table: 'transactions_inventory', field: 'non_session_field' },
          ],
        },
      ],
    };

    const sessionFields = extractSessionFieldsFromConfig(config);
    assert.deepEqual(sessionFields, [
      { table: 'transactions', field: 'pos_session_id' },
      { table: 'transactions_inventory', field: 'bmtr_pid' },
      { table: 'transactions_inventory', field: 'bmtr_session_id' },
      { table: 'transactions_payments', field: 'pos_session_id' },
    ]);
    assert.equal(
      sessionFields.some((sf) => sf.field === 'non_session_calc'),
      false,
    );
    assert.equal(
      sessionFields.some((sf) => sf.field === 'non_session_field'),
      false,
    );
    const uniqueKeys = new Set(
      sessionFields.map((sf) => `${sf.table}:${sf.field}`),
    );
    assert.equal(uniqueKeys.size, sessionFields.length);

    const sessionFieldsByTable = sessionFields.reduce((acc, sf) => {
      if (!acc[sf.table]) acc[sf.table] = [];
      acc[sf.table].push(sf.field);
      return acc;
    }, {});
    const tableTypeMap = {
      transactions: 'single',
      transactions_inventory: 'multi',
      transactions_payments: 'multi',
    };
    const initialValues = {
      transactions: { name: 'New Txn' },
      transactions_inventory: [
        { item: 'A' },
        { item: 'B', bmtr_pid: 'legacy', bmtr_session_id: 'legacy' },
      ],
      transactions_payments: [{ amount: 10 }],
    };
    const sid = 'session-123';

    const populated = applySessionIdToTables(
      initialValues,
      sid,
      sessionFieldsByTable,
      tableTypeMap,
    );

    assert.equal(populated.transactions.pos_session_id, sid);
    assert.equal(populated.transactions_inventory[0].bmtr_pid, sid);
    assert.equal(populated.transactions_inventory[0].bmtr_session_id, sid);
    assert.equal(populated.transactions_inventory[1].bmtr_pid, sid);
    assert.equal(populated.transactions_inventory[1].bmtr_session_id, sid);
    assert.equal(initialValues.transactions_inventory[1].bmtr_pid, 'legacy');
    assert.equal(populated.transactions_payments[0].pos_session_id, sid);
  });

  test('calc field preflight respects SUM aggregators and multi rows', async () => {
    const { findCalcFieldMismatch } = await mock.import(
      '../../src/erp.mgt.mn/pages/PosTransactions.jsx',
      {},
    );

    const calcFields = [
      {
        cells: [
          { table: 'transactions_pos', field: 'total_amount' },
          { table: 'transactions_order', field: 'ordrap', agg: 'SUM' },
          { table: 'transactions_inventory', field: 'bmtr_ap', agg: 'SUM' },
        ],
      },
      {
        cells: [
          { table: 'transactions_order', field: 'pos_session_id' },
          { table: 'transactions_inventory', field: 'pos_session_id' },
        ],
      },
    ];

    const baseData = {
      transactions_pos: { total_amount: 300 },
      transactions_order: [
        { ordrap: 100, pos_session_id: 'session-1' },
        { ordrap: 200, pos_session_id: 'session-1' },
      ],
      transactions_inventory: [
        { bmtr_ap: 150, pos_session_id: 'session-1' },
        { bmtr_ap: 150, pos_session_id: 'session-1' },
      ],
    };

    assert.equal(findCalcFieldMismatch(baseData, calcFields), null);

    const mismatchTotals = findCalcFieldMismatch(
      {
        ...baseData,
        transactions_pos: { total_amount: 400 },
      },
      calcFields,
    );
    assert.ok(mismatchTotals, 'should detect mismatched SUM totals');

    const mismatchSession = findCalcFieldMismatch(
      {
        ...baseData,
        transactions_inventory: baseData.transactions_inventory.map((row, idx) =>
          idx === 0 ? { ...row, pos_session_id: 'session-2' } : { ...row },
        ),
      },
      calcFields,
    );
    assert.ok(mismatchSession, 'should detect mismatched multi-row values');
  });


  test('generated column configs support lowercase generation_expression metadata', async () => {
    const actualTransactionValues = await import(
      '../../src/erp.mgt.mn/utils/transactionValues.js'
    );
    const stateOverrides = Array(21).fill(undefined);
    stateOverrides[0] = {}; // configs
    stateOverrides[1] = 'pos';
    stateOverrides[2] = {
      masterTable: 'transactions',
      masterType: 'multi',
      masterPosition: 'upper_left',
      tables: [],
    };
    stateOverrides[3] = {
      transactions: {
        mainFields: ['qty', 'price', 'virtual_total'],
        headerFields: [],
        footerFields: [],
      },
    };
    stateOverrides[4] = {
      transactions: [
        { name: 'qty' },
        { name: 'price' },
        { name: 'virtual_total', generation_expression: 'qty * price' },
      ],
    };
    const memoResults = [];
    const callbackResults = [];
    const recordedExpressions = [];
    const applyCalls = [];
    let stateIndex = 0;

    function resolveInitial(initial) {
      return typeof initial === 'function' ? initial() : initial;
    }

    function useState(initial) {
      const override =
        stateOverrides[stateIndex] !== undefined
          ? stateOverrides[stateIndex]
          : resolveInitial(initial);
      const idx = stateIndex;
      stateIndex += 1;
      const setter = () => {};
      return [override, setter];
    }

    function useMemo(fn, deps) {
      const result = fn();
      memoResults.push({ fn, deps, result });
      return result;
    }

    function useCallback(fn, deps) {
      callbackResults.push({ fn, deps });
      return fn;
    }

    const reactMock = {
      useState,
      useMemo,
      useCallback,
      useEffect: () => {},
      useRef: (initial) => ({ current: initial }),
      useContext: () => ({ user: {}, company: {}, branch: {} }),
      useReducer: (reducer, initial) => [resolveInitial(initial), () => {}],
      createElement: () => null,
      Fragment: Symbol.for('react.test.fragment'),
    };
    reactMock.default = reactMock;

    const pipelineConfigs = [];
    const generatedColumnsMock = {
      valuesEqual: (a, b) => a === b,
      createGeneratedColumnEvaluator: (expression) => {
        recordedExpressions.push(expression);
        return ({ row }) => {
          const qty = Number(row.qty ?? 0);
          const price = Number(row.price ?? 0);
          return qty * price;
        };
      },
      applyGeneratedColumnEvaluators: ({ targetRows, evaluators }) => {
        applyCalls.push({ targetRows, evaluators });
        let changed = false;
        targetRows.forEach((row, index) => {
          Object.entries(evaluators || {}).forEach(([field, evaluator]) => {
            const next = evaluator({ row, index });
            if (row[field] !== next) {
              row[field] = next;
              changed = true;
            }
          });
        });
        return { changed, metadata: null };
      },
    };

    const transactionValuesMock = {
      ...actualTransactionValues,
      createGeneratedColumnPipeline: (config) => {
        pipelineConfigs.push(config);
        return actualTransactionValues.createGeneratedColumnPipeline(config);
      },
      applyGeneratedColumnsForValues: (vals, pipelines) => {
        applyCalls.push({ vals, pipelines });
        return actualTransactionValues.applyGeneratedColumnsForValues(
          vals,
          pipelines,
        );
      },
    };
    transactionValuesMock.default = {
      ...actualTransactionValues.default,
      createGeneratedColumnPipeline: transactionValuesMock.createGeneratedColumnPipeline,
      applyGeneratedColumnsForValues:
        transactionValuesMock.applyGeneratedColumnsForValues,
    };

    const mod = await mock.import(
      '../../src/erp.mgt.mn/pages/PosTransactions.jsx',
      {
        react: reactMock,
        '../utils/generatedColumns.js': generatedColumnsMock,
        '../utils/transactionValues.js': transactionValuesMock,
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../hooks/useGeneralConfig.js': { default: () => ({}) },
        '../components/RowFormModal.jsx': { default: () => null },
        '../components/Modal.jsx': { default: () => null },
        '../utils/formatTimestamp.js': { default: (v) => v },
        '../utils/buildImageName.js': { default: () => '' },
        '../utils/slugify.js': { default: (v) => v },
        '../utils/debug.js': { debugLog: () => {} },
        '../utils/syncCalcFields.js': { syncCalcFields: (vals) => vals },
        '../utils/fetchTriggersForTables.js': { fetchTriggersForTables: () => [] },
      },
    );

    const PosTransactionsPage = mod.default;
    PosTransactionsPage();

    assert.ok(
      recordedExpressions.includes('qty * price'),
      'should compile generation_expression value',
    );

    const transactionsPipelineConfig = pipelineConfigs.find(
      (cfg) => Array.isArray(cfg?.tableColumns) && cfg.tableColumns.length > 0,
    );
    assert.ok(transactionsPipelineConfig, 'should build pipeline configuration');
    assert.equal(
      transactionsPipelineConfig.tableColumns.some((col) =>
        (col.generation_expression ?? col.generationExpression ?? '').includes('*'),
      ),
      true,
      'should receive generation_expression details',
    );

    const generatedEntry = memoResults.find(
      (entry) => entry.result && entry.result.transactions,
    );
    assert.ok(generatedEntry, 'should produce generated column configuration');
    assert.equal(
      typeof generatedEntry.result.transactions.evaluators.virtual_total,
      'function',
      'should register evaluator for virtual_total',
    );

    const applyHook = callbackResults.find((entry) =>
      typeof entry.fn === 'function' &&
      entry.fn.toString().includes('applyGeneratedColumnsForValues'),
    );
    assert.ok(applyHook, 'should expose generated column applier');

    const original = {
      transactions: [
        { id: 1, qty: 2, price: 5 },
        { id: 2, qty: 3, price: 4 },
      ],
    };
    const applied = applyHook.fn(original);

    assert.notStrictEqual(applied, original, 'should return new values object');
    assert.deepEqual(
      applied.transactions.map((row) => row.virtual_total),
      [10, 12],
      'should compute generated column values',
    );
    assert.ok(
      applyCalls.some((entry) => Object.prototype.hasOwnProperty.call(entry, 'pipelines')),
      'should delegate generated column application',
    );
  });

}

test('fetchTriggersForTables caches trigger metadata for hidden tables', async () => {
  const fetchesRef = { current: new Map() };
  const loadedRef = { current: new Set() };

  let resolveFetch;
  const pending = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const fetcher = mock.fn(() => pending);
  const updates = [];
  const applyResult = mock.fn((tbl, data) => {
    updates.push({ tbl, data });
    return true;
  });

  const [firstPromise] = fetchTriggersForTables({
    tables: ['hidden_tbl'],
    fetcher,
    fetchesRef,
    loadedRef,
    applyResult,
  });

  await Promise.resolve();
  assert.equal(fetcher.mock.calls.length, 1);

  const [secondPromise] = fetchTriggersForTables({
    tables: ['hidden_tbl'],
    fetcher,
    fetchesRef,
    loadedRef,
    applyResult,
  });

  await Promise.resolve();
  assert.equal(fetcher.mock.calls.length, 1);
  assert.strictEqual(firstPromise, secondPromise);

  resolveFetch({ triggers: [{ id: 1 }] });
  await firstPromise;

  assert.equal(applyResult.mock.calls.length, 1);
  assert.deepEqual(updates[0], {
    tbl: 'hidden_tbl',
    data: { triggers: [{ id: 1 }] },
  });
  assert.equal(loadedRef.current.has('hidden_tbl'), true);

  const thirdBatch = fetchTriggersForTables({
    tables: ['hidden_tbl'],
    fetcher,
    fetchesRef,
    loadedRef,
    applyResult,
  });

  assert.equal(thirdBatch.length, 0);
});

test('syncCalcFields aggregates SUM cells without mutating detail rows', () => {
  const calcFields = [
    {
      cells: [
        { table: 'transactions_pos', field: 'total_quantity' },
        { table: 'transactions_order', field: 'ordrsub', agg: 'SUM' },
        { table: 'transactions_inventory', field: 'bmtr_sub', agg: 'SUM' },
        { table: 'transactions_income', field: 'total_quantity' },
      ],
    },
    {
      cells: [
        { table: 'transactions_pos', field: 'total_amount' },
        { table: 'transactions_order', field: 'ordrap', agg: 'SUM' },
        { table: 'transactions_inventory', field: 'bmtr_ap', agg: 'SUM' },
        { table: 'transactions_income', field: 'or_or' },
      ],
    },
  ];

  const initial = {
    transactions_pos: { total_quantity: 0, total_amount: 0 },
    transactions_order: [
      { ordrsub: 2, ordrap: 100 },
      { ordrsub: 3, ordrap: 200 },
    ],
    transactions_inventory: [{ bmtr_sub: 4, bmtr_ap: 50 }],
    transactions_income: { total_quantity: 0, or_or: 0 },
  };

  const synced = syncCalcFields(initial, calcFields);
  assert.notStrictEqual(synced, initial);
  assert.equal(synced.transactions_pos.total_quantity, 9);
  assert.equal(synced.transactions_income.total_quantity, 9);
  assert.equal(synced.transactions_pos.total_amount, 350);
  assert.equal(synced.transactions_income.or_or, 350);
  assert.equal(initial.transactions_pos.total_quantity, 0);
  assert.equal(synced.transactions_order[0].ordrsub, 2);
  assert.equal(synced.transactions_order[1].ordrsub, 3);
  assert.equal(synced.transactions_inventory[0].bmtr_sub, 4);

  const updatedOrder = {
    ...synced,
    transactions_order: synced.transactions_order.map((row, idx) =>
      idx === 1 ? { ...row, ordrsub: 6, ordrap: 120 } : row,
    ),
  };

  const afterEdit = syncCalcFields(updatedOrder, calcFields);
  assert.equal(afterEdit.transactions_pos.total_quantity, 12);
  assert.equal(afterEdit.transactions_income.total_quantity, 12);
  assert.equal(afterEdit.transactions_pos.total_amount, 270);
  assert.equal(afterEdit.transactions_income.or_or, 270);
  assert.equal(afterEdit.transactions_order[1].ordrsub, 6);
  assert.equal(afterEdit.transactions_order[1].ordrap, 120);
  assert.equal(afterEdit.transactions_inventory[0].bmtr_sub, 4);

  const cleared = syncCalcFields(
    {
      ...afterEdit,
      transactions_order: [],
      transactions_inventory: [],
    },
    calcFields,
  );

  assert.equal(cleared.transactions_pos.total_quantity, 0);
  assert.equal(cleared.transactions_income.total_quantity, 0);
  assert.equal(cleared.transactions_pos.total_amount, 0);
  assert.equal(cleared.transactions_income.or_or, 0);
});

test('syncCalcFields aggregates AVG cells across detail rows', () => {
  const calcFields = [
    {
      cells: [
        { table: 'transactions_pos', field: 'avg_discount' },
        { table: 'transactions_order', field: 'line_discount', agg: 'AVG' },
        { table: 'transactions_income', field: 'avg_discount' },
      ],
    },
  ];

  const initial = {
    transactions_pos: { avg_discount: 0 },
    transactions_order: [
      { line: 1, line_discount: 10 },
      { line: 2, line_discount: 20 },
      { line: 3, line_discount: null },
    ],
    transactions_income: { avg_discount: 0 },
  };

  const synced = syncCalcFields(initial, calcFields);
  assert.equal(synced.transactions_pos.avg_discount, 15);
  assert.equal(synced.transactions_income.avg_discount, 15);
  assert.equal(synced.transactions_order[0].line_discount, 10);
  assert.equal(synced.transactions_order[1].line_discount, 20);
  assert.equal(synced.transactions_order[2].line_discount, null);

  const updated = {
    ...synced,
    transactions_order: synced.transactions_order.map((row) =>
      row.line === 2 ? { ...row, line_discount: 40 } : row,
    ),
  };

  const afterEdit = syncCalcFields(updated, calcFields);
  assert.equal(afterEdit.transactions_pos.avg_discount, 25);
  assert.equal(afterEdit.transactions_income.avg_discount, 25);
  assert.equal(afterEdit.transactions_order[1].line_discount, 40);

  const cleared = syncCalcFields(
    {
      ...afterEdit,
      transactions_order: [],
    },
    calcFields,
  );

  assert.equal(cleared.transactions_pos.avg_discount, 25);
  assert.equal(cleared.transactions_income.avg_discount, 25);
});

test('syncCalcFields updates multi table metadata for header fields', () => {
  const calcFields = [
    {
      tableSections: {
        transactions_order: { headerFields: ['pos_session_id'], footerFields: [] },
      },
      cells: [
        { table: 'transactions_pos', field: 'pos_session_id' },
        { table: 'transactions_order', field: 'pos_session_id' },
      ],
    },
  ];

  const initial = {
    transactions_pos: { pos_session_id: 'sess-100' },
    transactions_order: [
      { line: 1, qty: 2 },
      { line: 2, qty: 1 },
    ],
  };
  initial.transactions_order.header_note = 'keep-me';

  const synced = syncCalcFields(initial, calcFields);

  assert.notStrictEqual(synced.transactions_order, initial.transactions_order);
  assert.equal(synced.transactions_order[0].pos_session_id, 'sess-100');
  assert.equal(synced.transactions_order[1].pos_session_id, 'sess-100');
  assert.equal(synced.transactions_order.pos_session_id, 'sess-100');
  assert.equal(synced.transactions_order.header_note, 'keep-me');
  assert.equal(initial.transactions_order.pos_session_id, undefined);
});

test('syncCalcFields seeds metadata when rows omit multi table field', () => {
  const calcFields = [
    {
      cells: [
        { table: 'transactions_pos', field: 'pos_session_id' },
        { table: 'transactions_order', field: 'pos_session_id' },
      ],
    },
  ];

  const initial = {
    transactions_pos: { pos_session_id: 'sess-200' },
    transactions_order: [],
  };
  initial.transactions_order.footer_note = 'persist';

  const synced = syncCalcFields(initial, calcFields);

  assert.notStrictEqual(synced.transactions_order, initial.transactions_order);
  assert.equal(synced.transactions_order.length, 0);
  assert.equal(synced.transactions_order.pos_session_id, 'sess-200');
  assert.equal(synced.transactions_order.footer_note, 'persist');
  assert.equal(initial.transactions_order.pos_session_id, undefined);
});

test('syncCalcFields SUM handles localized numeric strings', () => {
  const calcFields = [
    {
      cells: [
        { table: 'transactions', field: 'total_qty', agg: 'SUM' },
        { table: 'transactions_inventory', field: 'qty', agg: 'SUM' },
      ],
    },
    {
      cells: [
        { table: 'transactions', field: 'total_amount', agg: 'SUM' },
        { table: 'transactions_inventory', field: 'amount', agg: 'SUM' },
      ],
    },
    {
      cells: [
        { table: 'transactions', field: 'total_discount', agg: 'SUM' },
        { table: 'transactions_inventory', field: 'discount', agg: 'SUM' },
      ],
    },
  ];

  const initial = {
    transactions: {
      total_qty: 0,
      total_amount: 0,
      total_discount: 0,
    },
    transactions_inventory: [
      {
        qty: '1,5',
        amount: '10\u00a0000',
        discount: '0,5',
      },
      {
        qty: '2',
        amount: '2 500',
        discount: '1',
      },
      {
        qty: '0,5',
        amount: '1.234,56',
        discount: '0',
      },
    ],
  };

  const synced = syncCalcFields(initial, calcFields);

  assert.notStrictEqual(
    synced.transactions,
    initial.transactions,
    'should create new master row when totals change',
  );
  assert.equal(synced.transactions.total_qty, 4);
  assert.equal(synced.transactions.total_amount, 13734.56);
  assert.equal(synced.transactions.total_discount, 1.5);
});

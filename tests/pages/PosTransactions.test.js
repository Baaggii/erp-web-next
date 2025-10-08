import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { fetchTriggersForTables } from '../../src/erp.mgt.mn/utils/fetchTriggersForTables.js';
import { syncCalcFields } from '../../src/erp.mgt.mn/utils/syncCalcFields.js';

if (typeof mock.import !== 'function') {
  test('PosTransactions delegates to FinanceTransactions', { skip: true }, () => {});
} else {
  test('PosTransactions delegates to FinanceTransactions', async () => {
    const financeCalls = [];
    const reactMock = {
      createElement(type, props, ...children) {
        const nextProps = children.length
          ? { ...props, children: children.length === 1 ? children[0] : children }
          : { ...props };
        return type(nextProps);
      },
    };
    reactMock.default = reactMock;

    const financeStub = mock.fn((props) => {
      financeCalls.push(props);
      return { rendered: props };
    });

    const mod = await mock.import(
      '../../src/erp.mgt.mn/pages/PosTransactions.jsx',
      {
        react: reactMock,
        './FinanceTransactions.jsx': { default: financeStub },
      },
    );

    const PosTransactionsPage = mod.default;
    const inputProps = { moduleLabel: 'POS Label', extra: 42 };
    const element = PosTransactionsPage(inputProps);

    assert.equal(financeStub.mock.calls.length, 1);
    assert.deepEqual(financeCalls[0], {
      moduleLabel: 'POS Label',
      extra: 42,
      moduleKey: 'pos_transactions',
    });
    assert.deepEqual(element, {
      rendered: {
        moduleLabel: 'POS Label',
        extra: 42,
        moduleKey: 'pos_transactions',
      },
    });
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

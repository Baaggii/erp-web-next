import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recalcGeneratedColumns,
  recalcTotals,
} from '../../src/erp.mgt.mn/utils/transactionValues.js';

const baseCalcFields = [
  {
    cells: [
      { table: 'items', field: 'price', agg: 'SUM' },
      { table: 'totals', field: 'subtotal' },
    ],
  },
];

const basePipelineMap = {
  items: {
    apply(rows) {
      let changed = false;

      rows.forEach((row, index) => {
        if (!row) return;
        const expected = (Number(row.price) || 0) * (Number(row.qty) || 0);
        if (row.line_total === expected) return;
        rows[index] = { ...row, line_total: expected };
        changed = true;
      });

      return { changed, metadata: null };
    },
  },
};

test('recalcGeneratedColumns applies calc fields and pipelines', () => {
  const initialValues = {
    items: [
      { price: 10, qty: 2 },
      { price: '5', qty: 1 },
    ],
    totals: {},
  };

  const result = recalcGeneratedColumns(
    initialValues,
    basePipelineMap,
    baseCalcFields,
  );

  assert.notStrictEqual(result, initialValues);
  assert.equal(result.totals.subtotal, 15);
  assert.equal(result.items[0].line_total, 20);
  assert.equal(result.items[1].line_total, 5);
  assert.equal(initialValues.items[0].line_total, undefined);
});

test('recalcTotals applies POS aggregates after generated columns', () => {
  const initialValues = {
    items: [
      { price: 10, qty: 2 },
      { price: 5, qty: 1 },
    ],
    totals: {},
    header: {},
  };

  const posFields = [
    {
      parts: [
        { table: 'header', field: 'grand_total' },
        { table: 'totals', field: 'subtotal', agg: '=' },
      ],
    },
  ];

  const result = recalcTotals(initialValues, {
    calcFields: baseCalcFields,
    pipelines: basePipelineMap,
    posFields,
  });

  assert.notStrictEqual(result, initialValues);
  assert.equal(result.totals.subtotal, 15);
  assert.equal(result.header.grand_total, 15);
  assert.equal(result.items[0].line_total, 20);
  assert.equal(initialValues.header.grand_total, undefined);
});

test('recalcTotals keeps POS fields aligned for localized numeric strings', () => {
  const initialValues = {
    transactions_pos: {
      total_amount: '1\u202f234,56',
      total_discount: '234,56',
      deposit_amount: '1\u202f300,00',
    },
  };

  const posFields = [
    {
      parts: [
        { table: 'transactions_pos', field: 'payable_amount' },
        { table: 'transactions_pos', field: 'total_amount', agg: '=' },
        { table: 'transactions_pos', field: 'total_discount', agg: '-' },
      ],
    },
    {
      parts: [
        { table: 'transactions_pos', field: 'cashback' },
        { table: 'transactions_pos', field: 'deposit_amount', agg: '=' },
        { table: 'transactions_pos', field: 'payable_amount', agg: '-' },
      ],
    },
  ];

  const result = recalcTotals(initialValues, {
    calcFields: [],
    pipelines: {},
    posFields,
  });

  assert.notStrictEqual(result, initialValues);
  assert.equal(result.transactions_pos.total_amount, initialValues.transactions_pos.total_amount);
  assert.equal(result.transactions_pos.total_discount, initialValues.transactions_pos.total_discount);
  assert.equal(result.transactions_pos.deposit_amount, initialValues.transactions_pos.deposit_amount);
  assert.equal(result.transactions_pos.payable_amount, 1000);
  assert.equal(result.transactions_pos.cashback, 300);
  assert.equal(initialValues.transactions_pos.payable_amount, undefined);
  assert.equal(initialValues.transactions_pos.cashback, undefined);
});

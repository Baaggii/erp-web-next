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

test('recalcGeneratedColumns applies pipelines to single-record tables', () => {
  const initialValues = {
    header: { qty: 3, price: 4 },
  };

  const pipelineMap = {
    header: {
      apply(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return { changed: false, metadata: null };
        const row = rows[0] || {};
        const total = Number(row.qty || 0) * Number(row.price || 0);
        const changed = row.total !== total;
        const nextRow = { ...row, total };
        rows[0] = nextRow;
        return {
          changed,
          metadata: { shadow_total: total * 2 },
        };
      },
    },
  };

  const result = recalcGeneratedColumns(initialValues, pipelineMap, []);

  assert.notStrictEqual(result, initialValues);
  assert.equal(result.header.total, 12);
  assert.equal(result.header.shadow_total, 24);
  assert.equal(initialValues.header.total, undefined);
  assert.equal(initialValues.header.shadow_total, undefined);
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

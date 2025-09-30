import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recalcGeneratedColumns,
  recalcTotals,
  serializeValuesForTransport,
  restoreValuesFromTransport,
  cloneValuesForRecalc,
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

test('serialize/restore values preserves metadata for multi tables', () => {
  const detailRows = [{ item: 'A', qty: 2 }];
  const metadata = { session_id: 'sid-1', note: 'Keep me' };
  const sourceValues = {
    master: { id: 1, name: 'Txn' },
    details: Object.assign([...detailRows], metadata),
  };

  const multiTables = new Set(['details']);
  const serialized = serializeValuesForTransport(sourceValues, multiTables);

  assert.deepEqual(serialized.master, sourceValues.master);
  assert.deepEqual(serialized.details.rows, detailRows);
  assert.deepEqual(serialized.details.meta, metadata);

  const restored = restoreValuesFromTransport(serialized, multiTables);

  assert.notStrictEqual(restored.details, sourceValues.details);
  assert.deepEqual(restored.details[0], detailRows[0]);
  assert.equal(restored.details.session_id, metadata.session_id);
  assert.equal(restored.details.note, metadata.note);
  assert.notStrictEqual(restored, sourceValues);
});

test('cloneValuesForRecalc copies arrays and metadata safely', () => {
  const detailRows = Object.assign([
    { item: 'A', qty: 1 },
    { item: 'B', qty: 3 },
  ], {
    session_id: 'sid-2',
  });
  const sourceValues = {
    master: { id: 10, total: 0 },
    details: detailRows,
  };

  const cloned = cloneValuesForRecalc(sourceValues, {
    excludeKeys: ['ignored'],
  });

  assert.notStrictEqual(cloned, sourceValues);
  assert.notStrictEqual(cloned.master, sourceValues.master);
  assert.notStrictEqual(cloned.details, sourceValues.details);
  assert.deepEqual(cloned.details, detailRows);
  assert.equal(cloned.details.session_id, 'sid-2');

  cloned.details[0].qty = 5;
  cloned.details.session_id = 'sid-changed';

  assert.equal(sourceValues.details[0].qty, 1);
  assert.equal(sourceValues.details.session_id, 'sid-2');
});

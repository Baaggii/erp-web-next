import test from 'node:test';
import assert from 'node:assert/strict';
import { propagateCalcFields } from '../../api-server/services/postPosTransaction.js';

const TEST_CFG = {
  calcFields: [
    {
      name: 'QuantityTotals',
      cells: [
        { table: 'transactions_pos', field: 'total_quantity' },
        { table: 'transactions_order', field: 'ordrsub', agg: 'SUM' },
        { table: 'transactions_inventory', field: 'bmtr_sub', agg: 'SUM' },
        { table: 'transactions_income', field: 'total_quantity' },
      ],
    },
    {
      name: 'AmountTotals',
      cells: [
        { table: 'transactions_pos', field: 'total_amount' },
        { table: 'transactions_order', field: 'ordrap', agg: 'SUM' },
        { table: 'transactions_inventory', field: 'bmtr_ap', agg: 'SUM' },
        { table: 'transactions_income', field: 'or_or' },
      ],
    },
    {
      name: 'DiscountTotals',
      cells: [
        { table: 'transactions_pos', field: 'total_discount' },
        { table: 'transactions_inventory', field: 'bmtr_Saleap', agg: 'SUM' },
        { table: 'transactions_income', field: 'total_discount' },
        { table: 'transactions_expense', field: 'z' },
      ],
    },
  ],
};

function createBaseData() {
  return {
    transactions_pos: { total_quantity: 0, total_amount: 0, total_discount: 0 },
    transactions_order: [],
    transactions_inventory: [],
    transactions_income: { total_quantity: 0, or_or: 0, total_discount: 0 },
    transactions_expense: { z: 0 },
  };
}

test('propagateCalcFields recalculates totals when order rows change', () => {
  const data = createBaseData();
  data.transactions_order.push(
    { ordrsub: 2, ordrap: 100 },
    { ordrsub: 3, ordrap: 250 },
  );

  propagateCalcFields(TEST_CFG, data);

  assert.equal(data.transactions_pos.total_quantity, 5);
  assert.equal(data.transactions_income.total_quantity, 5);
  assert.equal(data.transactions_pos.total_amount, 350);
  assert.equal(data.transactions_income.or_or, 350);
  assert.equal(data.transactions_pos.total_discount, 0);
  assert.equal(data.transactions_income.total_discount, 0);
  assert.equal(data.transactions_expense.z, 0);

  assert.equal(data.transactions_order[0].ordrsub, 2);
  assert.equal(data.transactions_order[1].ordrap, 250);

  data.transactions_order[1].ordrsub = 4;
  data.transactions_order[1].ordrap = 200;

  propagateCalcFields(TEST_CFG, data);

  assert.equal(data.transactions_pos.total_quantity, 6);
  assert.equal(data.transactions_income.total_quantity, 6);
  assert.equal(data.transactions_pos.total_amount, 300);
  assert.equal(data.transactions_income.or_or, 300);
  assert.equal(data.transactions_order[1].ordrsub, 4);
  assert.equal(data.transactions_order[1].ordrap, 200);

  data.transactions_order.shift();
  propagateCalcFields(TEST_CFG, data);

  assert.equal(data.transactions_pos.total_quantity, 4);
  assert.equal(data.transactions_income.total_quantity, 4);
  assert.equal(data.transactions_pos.total_amount, 200);
  assert.equal(data.transactions_income.or_or, 200);

  data.transactions_order.length = 0;
  propagateCalcFields(TEST_CFG, data);

  assert.equal(data.transactions_pos.total_quantity, 0);
  assert.equal(data.transactions_income.total_quantity, 0);
  assert.equal(data.transactions_pos.total_amount, 0);
  assert.equal(data.transactions_income.or_or, 0);
});

test('propagateCalcFields recalculates totals when inventory rows change', () => {
  const data = createBaseData();
  data.transactions_inventory.push(
    { bmtr_sub: 10, bmtr_ap: 100, bmtr_Saleap: 5 },
    { bmtr_sub: 3, bmtr_ap: 50, bmtr_Saleap: 2 },
  );

  propagateCalcFields(TEST_CFG, data);

  assert.equal(data.transactions_pos.total_quantity, 13);
  assert.equal(data.transactions_income.total_quantity, 13);
  assert.equal(data.transactions_pos.total_amount, 150);
  assert.equal(data.transactions_income.or_or, 150);
  assert.equal(data.transactions_pos.total_discount, 7);
  assert.equal(data.transactions_income.total_discount, 7);
  assert.equal(data.transactions_expense.z, 7);

  assert.equal(data.transactions_inventory[0].bmtr_sub, 10);
  assert.equal(data.transactions_inventory[1].bmtr_ap, 50);

  data.transactions_inventory[1].bmtr_sub = 5;
  data.transactions_inventory[1].bmtr_ap = 70;
  data.transactions_inventory[1].bmtr_Saleap = 4;

  propagateCalcFields(TEST_CFG, data);

  assert.equal(data.transactions_pos.total_quantity, 15);
  assert.equal(data.transactions_income.total_quantity, 15);
  assert.equal(data.transactions_pos.total_amount, 170);
  assert.equal(data.transactions_income.or_or, 170);
  assert.equal(data.transactions_pos.total_discount, 9);
  assert.equal(data.transactions_income.total_discount, 9);
  assert.equal(data.transactions_expense.z, 9);

  data.transactions_inventory.shift();
  propagateCalcFields(TEST_CFG, data);

  assert.equal(data.transactions_pos.total_quantity, 5);
  assert.equal(data.transactions_income.total_quantity, 5);
  assert.equal(data.transactions_pos.total_amount, 70);
  assert.equal(data.transactions_income.or_or, 70);
  assert.equal(data.transactions_pos.total_discount, 4);
  assert.equal(data.transactions_income.total_discount, 4);
  assert.equal(data.transactions_expense.z, 4);

  data.transactions_inventory.length = 0;
  propagateCalcFields(TEST_CFG, data);

  assert.equal(data.transactions_pos.total_quantity, 0);
  assert.equal(data.transactions_income.total_quantity, 0);
  assert.equal(data.transactions_pos.total_amount, 0);
  assert.equal(data.transactions_income.or_or, 0);
  assert.equal(data.transactions_pos.total_discount, 0);
  assert.equal(data.transactions_income.total_discount, 0);
  assert.equal(data.transactions_expense.z, 0);
});

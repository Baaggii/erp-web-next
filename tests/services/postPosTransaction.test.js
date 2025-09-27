import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import { pool } from '../../db/index.js';
import {
  postPosTransaction,
  propagateCalcFields,
  validateConfiguredFields,
} from '../../api-server/services/postPosTransaction.js';

if (typeof pool.getConnection !== 'function') {
  pool.getConnection = async () => {
    throw new Error('pool.getConnection must be mocked in tests');
  };
}

function mockMasterColumns(t, overrides = {}) {
  const base = {
    transactions_pos: [
      'id',
      'session_id',
      'company_id',
      'branch_id',
      'department_id',
      'emp_id',
      'pos_date',
      'total_quantity',
      'total_amount',
      'total_discount',
      'payment_type',
    ],
    transactions_pos_online: [
      'id',
      'session_id',
      'company_id',
      'branch_id',
      'department_id',
      'emp_id',
      'pos_date',
      'total_quantity',
      'total_amount',
      'total_discount',
      'payment_type',
    ],
  };
  const tables = { ...base, ...overrides };
  t.mock.method(pool, 'query', async (sql, params) => {
    if (
      typeof sql === 'string' &&
      sql.includes('FROM information_schema.COLUMNS')
    ) {
      const table = Array.isArray(params) ? params[0] : null;
      const cols = tables[table] || [];
      return [cols.map((name) => ({ COLUMN_NAME: name }))];
    }
    return [[]];
  });
}

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

const VALIDATION_CFG = {
  calcFields: [
    {
      cells: [
        { table: 'transactions_pos', field: 'total_amount' },
        { table: 'transactions_order', field: 'ordrap', agg: 'SUM' },
      ],
    },
    {
      cells: [
        { table: 'transactions_pos', field: 'pos_date' },
        { table: 'transactions_order', field: 'ordrdate' },
      ],
    },
  ],
  posFields: [
    {
      parts: [
        { table: 'transactions_pos', field: 'payable_amount', agg: '=' },
        { table: 'transactions_pos', field: 'total_amount', agg: '=' },
        { table: 'transactions_pos', field: 'total_discount', agg: '-' },
      ],
    },
  ],
};

const VALIDATION_TABLE_TYPES = new Map([
  ['transactions_pos', 'single'],
  ['transactions_order', 'multi'],
]);

function createValidationData() {
  return {
    transactions_pos: {
      total_amount: 200,
      total_discount: 50,
      payable_amount: 150,
      pos_date: '2024-02-01',
    },
    transactions_order: [
      { ordrap: 120, ordrdate: '2024-02-01' },
      { ordrap: 80, ordrdate: '2024-02-01' },
    ],
  };
}

function createBaseData() {
  return {
    transactions_pos: { total_quantity: 0, total_amount: 0, total_discount: 0 },
    transactions_order: [],
    transactions_inventory: [],
    transactions_income: { total_quantity: 0, or_or: 0, total_discount: 0 },
    transactions_expense: { z: 0 },
  };
}

const SIMPLE_POS_CONFIG = JSON.stringify({
  POS_Modmarket: { masterTable: 'transactions_pos' },
  ONLINE_POS: { masterTable: 'transactions_pos_online' },
});

function createMockConnection(expectedMasterTable, insertId, queries) {
  return {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql) => {
      queries.push(sql);
      if (
        typeof sql === 'string' &&
        sql.includes('information_schema.KEY_COLUMN_USAGE')
      ) {
        return [[]];
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith(`INSERT INTO ${expectedMasterTable}`)
      ) {
        return [{ insertId }];
      }
      if (typeof sql === 'string' && sql.startsWith('INSERT INTO')) {
        return [{ insertId: 0 }];
      }
      if (typeof sql === 'string' && sql.startsWith('UPDATE')) {
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
}

function createPostTransactionData(table) {
  return {
    [table]: {
      pos_date: '2024-02-01',
      total_amount: 100,
      total_quantity: 2,
      payment_type: 'Cash',
    },
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

test('validateConfiguredFields returns empty array for valid data', () => {
  const data = createValidationData();
  const errors = validateConfiguredFields(VALIDATION_CFG, data, VALIDATION_TABLE_TYPES);
  assert.equal(errors.length, 0);
});

test('validateConfiguredFields reports missing numeric value', () => {
  const data = createValidationData();
  delete data.transactions_pos.payable_amount;
  const errors = validateConfiguredFields(VALIDATION_CFG, data, VALIDATION_TABLE_TYPES);
  assert.ok(
    errors.some((msg) => msg.includes('Missing value for transactions_pos.payable_amount')),
  );
});

test('validateConfiguredFields rejects non-numeric values in multi tables', () => {
  const data = createValidationData();
  data.transactions_order[0].ordrap = 'oops';
  const errors = validateConfiguredFields(VALIDATION_CFG, data, VALIDATION_TABLE_TYPES);
  assert.ok(
    errors.some((msg) => msg.includes('Non-numeric value for transactions_order[0].ordrap')),
  );
});

test('validateConfiguredFields rejects negative amounts', () => {
  const data = createValidationData();
  data.transactions_pos.total_amount = -5;
  const errors = validateConfiguredFields(VALIDATION_CFG, data, VALIDATION_TABLE_TYPES);
  assert.ok(
    errors.some((msg) => msg.includes('Negative value not allowed for transactions_pos.total_amount')),
  );
});

test('validateConfiguredFields rejects invalid dates', () => {
  const data = createValidationData();
  data.transactions_pos.pos_date = '2024-02-30';
  const errors = validateConfiguredFields(VALIDATION_CFG, data, VALIDATION_TABLE_TYPES);
  assert.ok(errors.some((msg) => msg.includes('Invalid date for transactions_pos.pos_date')));
});

test('postPosTransaction uses POS_Modmarket layout config', async (t) => {
  const queries = [];
  const conn = createMockConnection('transactions_pos', 501, queries);
  t.mock.method(pool, 'getConnection', async () => conn);
  t.mock.method(fs, 'readFile', async () => SIMPLE_POS_CONFIG);
  mockMasterColumns(t);

  const id = await postPosTransaction(
    'POS_Modmarket',
    createPostTransactionData('transactions_pos'),
    { employeeId: 'EMP-1' },
    0,
  );

  assert.equal(id, 501);
  assert.ok(
    queries.some(
      (sql) =>
        typeof sql === 'string' && sql.startsWith('INSERT INTO transactions_pos'),
    ),
    'inserts into transactions_pos table',
  );
});

test('postPosTransaction uses ONLINE_POS layout config', async (t) => {
  const queries = [];
  const conn = createMockConnection('transactions_pos_online', 777, queries);
  t.mock.method(pool, 'getConnection', async () => conn);
  t.mock.method(fs, 'readFile', async () => SIMPLE_POS_CONFIG);
  mockMasterColumns(t);

  const id = await postPosTransaction(
    'ONLINE_POS',
    createPostTransactionData('transactions_pos_online'),
    { employeeId: 'EMP-2' },
    0,
  );

  assert.equal(id, 777);
  assert.ok(
    queries.some(
      (sql) =>
        typeof sql === 'string' &&
        sql.startsWith('INSERT INTO transactions_pos_online'),
    ),
    'inserts into transactions_pos_online table',
  );
});

test('postPosTransaction throws 400 when layout config is missing', async (t) => {
  const getConnectionMock = t.mock.method(
    pool,
    'getConnection',
    async () => createMockConnection('transactions_pos', 123, []),
  );
  t.mock.method(fs, 'readFile', async () => JSON.stringify({}));

  await assert.rejects(
    () =>
      postPosTransaction(
        'UNKNOWN_LAYOUT',
        createPostTransactionData('transactions_pos'),
        {},
        0,
      ),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(
        err.message,
        'POS transaction config not found for layout "UNKNOWN_LAYOUT"',
      );
      return true;
    },
  );

  assert.equal(getConnectionMock.mock.callCount(), 0);
});

test('postPosTransaction normalizes session info before persisting', async (t) => {
  const queries = [];
  const conn = createMockConnection('transactions_pos', 910, queries);
  t.mock.method(pool, 'getConnection', async () => conn);
  t.mock.method(fs, 'readFile', async () => SIMPLE_POS_CONFIG);
  mockMasterColumns(t);

  const id = await postPosTransaction(
    'POS_Modmarket',
    createPostTransactionData('transactions_pos'),
    {
      employeeId: 'EMP-99',
      companyId: 42,
      branchId: 7,
      date: '2024-03-15',
      ignoredField: 'ignore me',
    },
    0,
  );

  assert.equal(id, 910);
  const insertSql = queries.find(
    (sql) =>
      typeof sql === 'string' &&
      sql.startsWith('INSERT INTO transactions_pos'),
  );
  assert.ok(insertSql, 'insert query executed for master table');
  assert.ok(insertSql.includes('emp_id'), 'uses normalized emp_id column');
  assert.ok(insertSql.includes('company_id'), 'includes company_id column');
  assert.ok(insertSql.includes('branch_id'), 'includes branch_id column');
  assert.ok(!insertSql.includes('ignoredField'), 'drops unknown session keys');
  assert.ok(!insertSql.includes('employeeId'), 'does not use camelCase key');
});

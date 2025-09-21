import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPool(handler) {
  const originalQuery = db.pool.query;
  const originalGet = db.pool.getConnection;
  db.pool.query = handler;
  db.pool.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: handler,
  });
  return () => {
    db.pool.query = originalQuery;
    db.pool.getConnection = originalGet;
  };
}

test('listRowReferences counts referencing rows', async () => {
  let step = 0;
  const restore = mockPool(async (sql, params) => {
    step++;
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      if (params[0] === 'users') {
        return [[{
          CONSTRAINT_NAME: 'fk_orders_users',
          TABLE_NAME: 'orders',
          COLUMN_NAME: 'user_id',
          REFERENCED_COLUMN_NAME: 'id',
        }]];
      }
      return [[]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      assert.equal(params[0], 'orders');
      assert.equal(params[1], 'user_id');
      assert.equal(params[2], '5');
      return [[{ count: 2 }]];
    }
    throw new Error('unexpected query');
  });
  const refs = await db.listRowReferences('users', '5');
  restore();
  assert.deepEqual(refs, [
    {
      table: 'orders',
      column: 'user_id',
      value: '5',
      queryValue: '5',
      columns: ['user_id'],
      values: ['5'],
      queryValues: ['5'],
      count: 2,
    },
  ]);
});

test('listRowReferences handles composite foreign keys', async () => {
  const restore = mockPool(async (sql, params) => {
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[
        { COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
        { COLUMN_NAME: 'id', SEQ_IN_INDEX: 2 },
      ]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      return [[
        {
          CONSTRAINT_NAME: 'fk_orders_users',
          TABLE_NAME: 'orders',
          COLUMN_NAME: 'company_id',
          REFERENCED_COLUMN_NAME: 'company_id',
        },
        {
          CONSTRAINT_NAME: 'fk_orders_users',
          TABLE_NAME: 'orders',
          COLUMN_NAME: 'user_id',
          REFERENCED_COLUMN_NAME: 'id',
        },
      ]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      assert.equal(params[0], 'orders');
      assert.equal(params[1], 'company_id');
      assert.equal(params[2], '5');
      assert.equal(params[3], 'user_id');
      assert.equal(params[4], '7');
      return [[{ count: 1 }]];
    }
    throw new Error('unexpected query');
  });
  const refs = await db.listRowReferences('users', '5-7');
  restore();
  assert.deepEqual(refs, [
    {
      table: 'orders',
      columns: ['company_id', 'user_id'],
      values: ['5', '7'],
      queryValues: ['5', '7'],
      count: 1,
    },
  ]);
});

test('listRowReferences fills non-primary referenced columns from target row', async () => {
  const targetRow = {
    company_id: '55',
    employment_emp_id: 'EMP9',
    employment_position_id: '10',
    employment_workplace_id: '20',
    employment_date: '20240101',
    employment_department_id: '30',
    employment_branch_id: '40',
    employment_company_id: '7',
  };
  const identifier = [
    targetRow.company_id,
    targetRow.employment_emp_id,
    targetRow.employment_position_id,
    targetRow.employment_workplace_id,
    targetRow.employment_date,
    targetRow.employment_department_id,
    targetRow.employment_branch_id,
  ].join('-');
  const restore = mockPool(async (sql, params) => {
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[]];
    }
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes('NON_UNIQUE = 0')
    ) {
      return [[
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_emp_id', SEQ_IN_INDEX: 2 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_position_id', SEQ_IN_INDEX: 3 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_workplace_id', SEQ_IN_INDEX: 4 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_date', SEQ_IN_INDEX: 5 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_department_id', SEQ_IN_INDEX: 6 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_branch_id', SEQ_IN_INDEX: 7 },
      ]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      return [[
        {
          CONSTRAINT_NAME: 'users_ibfk_1',
          TABLE_NAME: 'users',
          COLUMN_NAME: 'company_id',
          REFERENCED_COLUMN_NAME: 'employment_company_id',
        },
        {
          CONSTRAINT_NAME: 'users_ibfk_1',
          TABLE_NAME: 'users',
          COLUMN_NAME: 'empid',
          REFERENCED_COLUMN_NAME: 'employment_emp_id',
        },
      ]];
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE')) {
      assert.deepEqual(params, [
        'tbl_employment',
        'company_id',
        targetRow.company_id,
        'employment_emp_id',
        targetRow.employment_emp_id,
        'employment_position_id',
        targetRow.employment_position_id,
        'employment_workplace_id',
        targetRow.employment_workplace_id,
        'employment_date',
        targetRow.employment_date,
        'employment_department_id',
        targetRow.employment_department_id,
        'employment_branch_id',
        targetRow.employment_branch_id,
      ]);
      return [[targetRow]];
    }
    if (sql.startsWith('SELECT COUNT(*) AS count FROM ?? WHERE')) {
      assert.deepEqual(params, [
        'users',
        'company_id',
        targetRow.employment_company_id,
        'empid',
        targetRow.employment_emp_id,
      ]);
      return [[{ count: 1 }]];
    }
    throw new Error('unexpected query');
  });
  const refs = await db.listRowReferences('tbl_employment', identifier);
  restore();
  assert.deepEqual(refs, [
    {
      table: 'users',
      columns: ['company_id', 'empid'],
      values: [targetRow.employment_company_id, targetRow.employment_emp_id],
      queryValues: [
        targetRow.employment_company_id,
        targetRow.employment_emp_id,
      ],
      count: 1,
    },
  ]);
});

test('deleteTableRowCascade removes dependent rows with non-primary referenced columns', async () => {
  const calls = [];
  const targetRow = {
    company_id: '55',
    employment_emp_id: 'EMP9',
    employment_position_id: '10',
    employment_workplace_id: '20',
    employment_date: '20240101',
    employment_department_id: '30',
    employment_branch_id: '40',
    employment_company_id: '7',
  };
  const identifier = [
    targetRow.company_id,
    targetRow.employment_emp_id,
    targetRow.employment_position_id,
    targetRow.employment_workplace_id,
    targetRow.employment_date,
    targetRow.employment_department_id,
    targetRow.employment_branch_id,
  ].join('-');
  const restore = mockPool(async (sql, params) => {
    calls.push({ sql, params });
    if (
      sql.includes('information_schema.STATISTICS') &&
      sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      if (params?.[0] === 'tbl_employment') {
        return [[]];
      }
      if (params?.[0] === 'users') {
        return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
      }
    }
    if (
      sql.includes('information_schema.STATISTICS') &&
      sql.includes('NON_UNIQUE = 0') &&
      params?.[0] === 'tbl_employment'
    ) {
      return [[
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_emp_id', SEQ_IN_INDEX: 2 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_position_id', SEQ_IN_INDEX: 3 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_workplace_id', SEQ_IN_INDEX: 4 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_date', SEQ_IN_INDEX: 5 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_department_id', SEQ_IN_INDEX: 6 },
        { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_branch_id', SEQ_IN_INDEX: 7 },
      ]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      if (params?.[0] === 'tbl_employment') {
        return [[
          {
            CONSTRAINT_NAME: 'users_ibfk_1',
            TABLE_NAME: 'users',
            COLUMN_NAME: 'company_id',
            REFERENCED_COLUMN_NAME: 'employment_company_id',
          },
          {
            CONSTRAINT_NAME: 'users_ibfk_1',
            TABLE_NAME: 'users',
            COLUMN_NAME: 'empid',
            REFERENCED_COLUMN_NAME: 'employment_emp_id',
          },
        ]];
      }
      if (params?.[0] === 'users') {
        return [[]];
      }
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE') && params?.[0] === 'tbl_employment') {
      return [[targetRow]];
    }
    if (sql.startsWith('SELECT COUNT(*) AS count FROM ?? WHERE') && params?.[0] === 'users') {
      return [[{ count: 1 }]];
    }
    if (sql.startsWith('SELECT `id` FROM ?? WHERE') && params?.[0] === 'users') {
      return [[{ id: 99 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      if (params?.[0] === 'users') {
        return [[
          { COLUMN_NAME: 'id' },
          { COLUMN_NAME: 'company_id' },
          { COLUMN_NAME: 'empid' },
          { COLUMN_NAME: 'password' },
        ]];
      }
      if (params?.[0] === 'tbl_employment') {
        return [[
          { COLUMN_NAME: 'company_id' },
          { COLUMN_NAME: 'employment_emp_id' },
          { COLUMN_NAME: 'employment_position_id' },
          { COLUMN_NAME: 'employment_workplace_id' },
          { COLUMN_NAME: 'employment_date' },
          { COLUMN_NAME: 'employment_department_id' },
          { COLUMN_NAME: 'employment_branch_id' },
          { COLUMN_NAME: 'employment_company_id' },
        ]];
      }
    }
    if (sql.startsWith('DELETE FROM ?? WHERE') && params?.[0] === 'users') {
      return [{}];
    }
    if (sql.startsWith('DELETE FROM ?? WHERE') && params?.[0] === 'tbl_employment') {
      return [{}];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  await db.deleteTableRowCascade('tbl_employment', identifier, targetRow.company_id);
  restore();
  const deletes = calls.filter((c) => c.sql.startsWith('DELETE FROM'));
  assert.equal(deletes.length, 2);
  const userDelete = deletes.find((c) => c.params?.[0] === 'users');
  assert.deepEqual(
    userDelete ? userDelete.params.map((p) => String(p)) : null,
    ['users', '99', targetRow.company_id],
  );
  const employmentDelete = deletes.find((c) => c.params?.[0] === 'tbl_employment');
  assert.deepEqual(
    employmentDelete ? employmentDelete.params.map((p) => String(p)) : null,
    [
      'tbl_employment',
      targetRow.company_id,
      targetRow.employment_emp_id,
      targetRow.employment_position_id,
      targetRow.employment_workplace_id,
      targetRow.employment_date,
      targetRow.employment_department_id,
      targetRow.employment_branch_id,
    ],
  );
});

test('deleteTableRowCascade deletes related rows first', async () => {
  const calls = [];
  const restore = mockPool(async (sql, params) => {
    calls.push({ sql, params });
    if (
      sql.includes('information_schema.STATISTICS') && sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      return [[{ TABLE_NAME: 'orders', COLUMN_NAME: 'user_id', REFERENCED_COLUMN_NAME: 'id' }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id' }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ count: 1 }]];
    }
    if (sql.startsWith('SELECT `id` FROM')) {
      return [[{ id: 3 }]];
    }
    if (sql.startsWith('DELETE FROM')) {
      return [{}];
    }
    throw new Error('unexpected query');
  });
  await db.deleteTableRowCascade('users', '7');
  restore();
  const deletes = calls.filter(c => c.sql.startsWith('DELETE FROM'));
  assert.equal(deletes.length, 2);
  assert.ok(deletes[0].params.includes('orders'));
  assert.ok(deletes[1].params.includes('users'));
});

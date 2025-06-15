import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPool(columns) {
  const original = db.pool.query;
  db.pool.query = async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [columns.map((c) => ({ COLUMN_NAME: c }))];
    }
    return [[]];
  };
  return () => {
    db.pool.query = original;
  };
}

test('listTableRows rejects invalid filter column', async () => {
  const restore = mockPool(['id', 'name']);
  await assert.rejects(
    db.listTableRows('users', { filters: { bad: 'x' } }),
    /Invalid column name/
  );
  restore();
});

test('updateTableRow rejects invalid column', async () => {
  const restore = mockPool(['id', 'name']);
  await assert.rejects(
    db.updateTableRow('users', 1, { bad: 'x' }),
    /Invalid column name/
  );
  restore();
});

test('insertTableRow rejects invalid column', async () => {
  const restore = mockPool(['id', 'name']);
  await assert.rejects(
    db.insertTableRow('users', { bad: 'x' }),
    /Invalid column name/
  );
  restore();
});

test('deleteTableRow uses primary key when no id column', async () => {
  const original = db.pool.query;
  let called = false;
  db.pool.query = async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'module_key', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    called = true;
    assert.equal(sql, 'DELETE FROM ?? WHERE `module_key` = ?');
    assert.deepEqual(params, ['modules', 'sales']);
    return [{}];
  };
  await db.deleteTableRow('modules', 'sales');
  db.pool.query = original;
  assert.ok(called);
});

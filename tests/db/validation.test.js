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

test('deleteTableRow rejects when nothing deleted', async () => {
  const original = db.pool.query;
  db.pool.query = async () => [{ affectedRows: 0 }];
  await assert.rejects(
    db.deleteTableRow('users', 1),
    /Row not found/
  );
  db.pool.query = original;
});

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

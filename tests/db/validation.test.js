import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPool(columns) {
  const original = db.pool.query;
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SHOW KEYS')) {
      return [columns.map((c) => ({ Column_name: c }))];
    }
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
    if (sql.startsWith('SHOW KEYS')) {
      return [[{ Column_name: 'module_key' }]];
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

test('deleteTableRow rejects when no primary or unique key', async () => {
  const original = db.pool.query;
  db.pool.query = async (sql) => {
    if (sql.startsWith('SHOW KEYS')) {
      return [[]];
    }
    if (sql.startsWith('SHOW INDEX')) {
      return [[]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'name', COLUMN_KEY: '', EXTRA: '' }]];
    }
    throw new Error('should not query delete');
  };
  await assert.rejects(
    db.deleteTableRow('nopk', '1'),
    /no primary or unique key/i,
  );
  db.pool.query = original;
});

test('updateTableRow rejects when no primary or unique key', async () => {
  const original = db.pool.query;
  db.pool.query = async (sql) => {
    if (sql.startsWith('SHOW KEYS')) {
      return [[]];
    }
    if (sql.startsWith('SHOW INDEX')) {
      return [[]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'name', COLUMN_KEY: '', EXTRA: '' }]];
    }
    throw new Error('should not query update');
  };
  await assert.rejects(
    db.updateTableRow('nopk', '1', { name: 'x' }),
    /no primary or unique key/i,
  );
  db.pool.query = original;
});

test('updateTableRow uses composite primary key', async () => {
  const original = db.pool.query;
  let called = false;
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SHOW KEYS')) {
      return [[{ Column_name: 'empid' }, { Column_name: 'company_id' }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'name' }]];
    }
    called = true;
    assert.equal(
      sql,
      'UPDATE ?? SET `name` = ? WHERE `empid` = ? AND `company_id` = ?',
    );
    assert.deepEqual(params, ['employees', 'Bob', 'E1', 'C2']);
    return [{}];
  };
  await db.updateTableRow('employees', 'E1-C2', { name: 'Bob' });
  db.pool.query = original;
  assert.ok(called);
});

test('deleteTableRow uses composite primary key', async () => {
  const original = db.pool.query;
  let called = false;
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SHOW KEYS')) {
      return [[{ Column_name: 'empid' }, { Column_name: 'company_id' }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[]];
    }
    called = true;
    assert.equal(
      sql,
      'DELETE FROM ?? WHERE `empid` = ? AND `company_id` = ?',
    );
    assert.deepEqual(params, ['employees', 'E1', 'C2']);
    return [{}];
  };
  await db.deleteTableRow('employees', 'E1-C2');
  db.pool.query = original;
  assert.ok(called);
});

test('updateTableRow uses unique key when no primary key', async () => {
  const original = db.pool.query;
  let called = false;
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SHOW KEYS')) {
      return [[]];
    }
    if (sql.startsWith('SHOW INDEX')) {
      return [[{ Key_name: 'u_code', Column_name: 'code', Seq_in_index: 1 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'name' }]];
    }
    called = true;
    assert.equal(sql, 'UPDATE ?? SET `name` = ? WHERE `code` = ?');
    assert.deepEqual(params, ['products', 'Widget', 'A1']);
    return [{}];
  };
  await db.updateTableRow('products', 'A1', { name: 'Widget' });
  db.pool.query = original;
  assert.ok(called);
});

test('deleteTableRow uses unique key combination', async () => {
  const original = db.pool.query;
  let called = false;
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SHOW KEYS')) {
      return [[]];
    }
    if (sql.startsWith('SHOW INDEX')) {
      return [[
        { Key_name: 'u_emp_comp', Column_name: 'empid', Seq_in_index: 1 },
        { Key_name: 'u_emp_comp', Column_name: 'company_id', Seq_in_index: 2 },
      ]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[]];
    }
    called = true;
    assert.equal(
      sql,
      'DELETE FROM ?? WHERE `empid` = ? AND `company_id` = ?',
    );
    assert.deepEqual(params, ['assign', 'E1', 'C1']);
    return [{}];
  };
  await db.deleteTableRow('assign', 'E1-C1');
  db.pool.query = original;
  assert.ok(called);
});

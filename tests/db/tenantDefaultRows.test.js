import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

const TABLE = 'posts';

function mockMetadataQueries(t, options = {}) {
  const {
    primaryKeys = ['id'],
    columns = [
      'company_id',
      'id',
      'title',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
    ],
    initialRow = { id: 5, company_id: 0, title: 'Welcome', created_by: 7, updated_by: 7 },
  } = options;
  let rowState = { ...initialRow };
  const operations = { inserts: [], updates: [], deletes: [] };
  let nextInsertId = options.insertId ?? 11;
  const queryMock = t.mock.method(db.pool, 'query', async (sql, params) => {
    if (typeof sql !== 'string') {
      return [[{ COLUMN_NAME: 'id' }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [columns.map((name) => ({ COLUMN_NAME: name }))];
    }
    if (sql.includes('information_schema.STATISTICS')) {
      return [primaryKeys.map((name, idx) => ({ COLUMN_NAME: name, SEQ_IN_INDEX: idx + 1 }))];
    }
    if (/^INSERT INTO \?\?/.test(sql)) {
      const match = sql.match(/\(([^)]+)\)\s+VALUES/i);
      const cols = match
        ? match[1]
            .split(',')
            .map((part) => part.replace(/`/g, '').trim())
        : [];
      const values = params.slice(1);
      const record = {};
      cols.forEach((col, idx) => {
        record[col] = values[idx];
      });
      const assignedId = record.id ?? nextInsertId++;
      record.id = assignedId;
      operations.inserts.push({ sql, params, record });
      rowState = { ...rowState, ...record };
      return [{ insertId: assignedId }];
    }
    if (/^UPDATE \?\? SET/.test(sql)) {
      const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
      const setClause = setMatch ? setMatch[1] : '';
      const cols = setClause
        .split(',')
        .map((segment) => segment.trim().split('=')[0])
        .map((col) => col.replace(/`/g, '').trim())
        .filter(Boolean);
      const values = params.slice(1, 1 + cols.length);
      const updateRecord = {};
      cols.forEach((col, idx) => {
        updateRecord[col] = values[idx];
      });
      operations.updates.push({ sql, params, record: updateRecord });
      rowState = { ...rowState, ...updateRecord };
      return [{ affectedRows: 1 }];
    }
    if (/^DELETE FROM \?\?/.test(sql)) {
      operations.deletes.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT * FROM')) {
      return [[{ ...rowState }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 0 }]];
    }
    return [[{ COLUMN_NAME: 'id' }]];
  });
  return {
    getRow: () => ({ ...rowState }),
    setRow: (next) => {
      rowState = { ...rowState, ...next };
    },
    operations,
    restore: () => queryMock.mock.restore(),
  };
}

test('insertTenantDefaultRow applies audit fields and returns inserted row', async (t) => {
  const metadata = mockMetadataQueries(t);
  const row = await db.insertTenantDefaultRow(TABLE, { title: 'New Post' }, 42);
  const ops = metadata.operations.inserts;
  assert.equal(ops.length, 1);
  assert.equal(ops[0].params[0], TABLE);
  const inserted = metadata.getRow();
  assert.equal(inserted.company_id, 0);
  assert.equal(inserted.created_by, 42);
  assert.equal(inserted.updated_by, 42);
  assert.ok(inserted.created_at);
  assert.ok(inserted.updated_at);
  assert.equal(row.title, 'New Post');
  assert.equal(row.company_id, 0);
  metadata.restore();
});

test('updateTenantDefaultRow forwards updates and includes audit metadata', async (t) => {
  const metadata = mockMetadataQueries(t, {
    initialRow: { id: 7, company_id: 0, title: 'Original', updated_by: 3 },
  });
  const row = await db.updateTenantDefaultRow(TABLE, '7', { title: 'Updated' }, 99);
  const ops = metadata.operations.updates;
  assert.equal(ops.length, 1);
  assert.equal(ops[0].params[0], TABLE);
  const updated = metadata.getRow();
  assert.equal(updated.title, 'Updated');
  assert.equal(updated.updated_by, 99);
  assert.ok(updated.updated_at);
  assert.equal(row.title, 'Updated');
  metadata.restore();
});

test('deleteTenantDefaultRow scopes delete to company 0', async (t) => {
  const metadata = mockMetadataQueries(t);
  await db.deleteTenantDefaultRow(TABLE, '5', 12);
  const ops = metadata.operations.deletes;
  assert.equal(ops.length, 1);
  assert.equal(ops[0].params[0], TABLE);
  const companyParam = ops[0].params.at(-1);
  assert.equal(companyParam, 0);
  metadata.restore();
});

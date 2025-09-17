import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPool(handler) {
  const originalQuery = db.pool.query;
  db.pool.query = async (sql, params) => {
    const normalizedSql = typeof sql === 'string' ? sql : sql?.sql || '';
    const result = await handler(normalizedSql, params);
    if (result === undefined) {
      throw new Error(`Unexpected query: ${normalizedSql}`);
    }
    return result;
  };
  return () => {
    db.pool.query = originalQuery;
  };
}

test('getTenantTable infers tenant keys from columns', async () => {
  const restore = mockPool((sql) => {
    if (sql.includes('FROM tenant_tables')) {
      return [[{ is_shared: 1, seed_on_create: 0 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'Company_ID' },
        { COLUMN_NAME: 'branch_id' },
        { COLUMN_NAME: 'name' },
      ]];
    }
    return undefined;
  });
  try {
    const table = await db.getTenantTable('code_branches');
    assert.deepEqual(table, {
      tableName: 'code_branches',
      isShared: true,
      tenantKeys: ['Company_ID', 'branch_id'],
    });
  } finally {
    restore();
  }
});

test('getTenantTable returns null when table missing', async () => {
  const restore = mockPool((sql) => {
    if (sql.includes('FROM tenant_tables')) {
      return [[{ is_shared: 0, seed_on_create: 0 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[]];
    }
    return undefined;
  });
  try {
    const table = await db.getTenantTable('missing_table');
    assert.equal(table, null);
  } finally {
    restore();
  }
});

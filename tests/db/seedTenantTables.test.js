import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import * as db from '../../db/index.js';

await test('seedTenantTables copies user level permissions', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[]];
    }
    return [[], []];
  };
  await db.seedTenantTables(7, null, {}, false, 1);
  db.pool.query = orig;
  const insertCall = calls.find((c) => /INSERT INTO user_level_permissions/.test(c.sql));
  assert.ok(insertCall);
  assert.deepEqual(insertCall.params, [7, 1]);
  assert.match(
    insertCall.sql,
    /user_level_permissions \(company_id, userlevel_id, action, action_key, created_by, created_at\)/,
  );
  assert.match(
    insertCall.sql,
    /SELECT \?,\s*userlevel_id, action, action_key, \?, NOW\(\)\s+FROM user_level_permissions\s+WHERE company_id = 0/,
  );
});

await test('seedTenantTables filters by record ids', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 0 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    if (sql.startsWith('INSERT INTO ??')) {
      return [{ affectedRows: 2 }];
    }
    return [[], []];
  };
  const result = await db.seedTenantTables(7, null, { posts: [1, 2] }, false, 1);
  db.pool.query = orig;
  const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO ??'));
  assert.ok(insertCall);
  assert.match(insertCall.sql, /IN \(\?, \?\)/);
  assert.deepEqual(insertCall.params, ['posts', 7, 'posts', 1, 2]);
  assert.deepEqual(result.summary, { posts: { count: 2, ids: [1, 2] } });
});

await test('seedTenantTables returns summary for provided rows', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 0 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'is_deleted', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'deleted_by', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'deleted_at', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    if (sql.startsWith('SELECT column_name, mn_label FROM table_column_labels')) {
      return [[]];
    }
    if (sql.startsWith('INSERT INTO ?? (`company_id`, `id`, `title`)')) {
      return [{ affectedRows: 1, insertId: 77 }];
    }
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      return [{ affectedRows: 0 }];
    }
    return [[], []];
  };
  const result = await db.seedTenantTables(
    9,
    null,
    { posts: [{ id: 55, title: 'Hello' }] },
    false,
    42,
  );
  db.pool.query = orig;
  assert.deepEqual(result.summary, { posts: { count: 1, ids: [55] } });
  const insert = calls.find((c) =>
    c.sql.startsWith('INSERT INTO ?? (`company_id`, `id`, `title`)'),
  );
  assert.ok(insert);
});

await test('seedTenantTables overrides audit columns', async () => {
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 0 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'created_by', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'created_at', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'updated_by', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'updated_at', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    return [[], []];
  };
  await db.seedTenantTables(7, ['posts'], {}, false, 123, 456);
  db.pool.query = orig;
  const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO ??'));
  assert.ok(insertCall);
  assert.match(
    insertCall.sql,
    /SELECT \? AS company_id, `id`, \?, NOW\(\), \?, NOW\(\)/,
  );
  assert.deepEqual(insertCall.params, ['posts', 7, 123, 456, 'posts']);
});

await test('seedTenantTables creates backup metadata before overwrite', async () => {
  const companyId = 77;
  const companyConfigDir = path.join(process.cwd(), 'config', String(companyId));
  await fs.rm(companyConfigDir, { recursive: true, force: true });

  const origQuery = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?')) {
      return [[{ cnt: 2 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'is_deleted', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'deleted_by', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'deleted_at', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    if (sql.startsWith('SELECT column_name, mn_label FROM table_column_labels')) {
      return [[]];
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE company_id = ?')) {
      return [[
        { id: 10, company_id: companyId, title: 'Hello' },
        { id: 11, company_id: companyId, title: 'World' },
      ]];
    }
    if (sql.startsWith('UPDATE ?? SET `is_deleted` = 1')) {
      return [{ affectedRows: 2 }];
    }
    if (sql.startsWith('INSERT INTO ?? (`company_id`, `id`, `title`)')) {
      return [{ affectedRows: 2 }];
    }
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      return [{ affectedRows: 0 }];
    }
    return [[], []];
  };

  const result = await db.seedTenantTables(
    companyId,
    null,
    {},
    true,
    5,
    5,
    {
      backupName: 'Manual Backup',
      originalBackupName: 'Manual Backup',
      requestedBy: 5,
    },
  );
  db.pool.query = origQuery;

  const updateCall = calls.find((c) => c.sql.startsWith('UPDATE ?? SET `is_deleted` = 1'));
  assert.ok(updateCall);
  assert.match(
    updateCall.sql,
    /SET `is_deleted` = 1, `deleted_by` = \?, `deleted_at` = \? WHERE company_id = \?/,
  );
  assert.equal(updateCall.params[0], 'posts');
  assert.equal(updateCall.params[1], 5);
  assert.match(String(updateCall.params[2]), /^\d{4}-\d{2}-\d{2} /);
  assert.equal(updateCall.params[3], companyId);

  assert.ok(result.backup);
  assert.equal(result.backup.companyId, companyId);
  assert.equal(result.backup.originalName, 'Manual Backup');
  assert.equal(result.backup.versionName, 'manual-backup');
  assert.equal(result.backup.tableCount, 1);
  assert.equal(result.backup.rowCount, 2);
  assert.ok(Array.isArray(result.backup.tables));
  assert.equal(result.backup.tables[0].tableName, 'posts');
  assert.equal(result.backup.tables[0].rows, 2);

  const backupDir = path.join(companyConfigDir, 'defaults', 'seed-backups');
  const indexPath = path.join(backupDir, 'index.json');
  const indexRaw = await fs.readFile(indexPath, 'utf8');
  const entries = JSON.parse(indexRaw);
  assert.ok(Array.isArray(entries));
  assert.ok(entries.length >= 1);
  assert.equal(entries[0].fileName, result.backup.fileName);
  assert.equal(entries[0].originalName, 'Manual Backup');

  const backupPath = path.join(backupDir, result.backup.fileName);
  const sql = await fs.readFile(backupPath, 'utf8');
  assert.match(sql, /DELETE FROM `posts` WHERE `company_id` = 77;/);
  assert.match(
    sql,
    /INSERT INTO `posts` \(`id`, `company_id`, `title`(?:, `is_deleted`, `deleted_by`, `deleted_at`)?\)/,
  );

  await fs.rm(companyConfigDir, { recursive: true, force: true });
});

await test('seedTenantTables overwrites existing rows with upsert', async () => {
  const companyId = 88;
  const companyConfigDir = path.join(process.cwd(), 'config', String(companyId));
  await fs.rm(companyConfigDir, { recursive: true, force: true });

  const origQuery = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?')) {
      return [[{ cnt: 1 }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'is_deleted', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'deleted_by', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'deleted_at', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'updated_by', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'updated_at', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    if (sql.startsWith('SELECT column_name, mn_label FROM table_column_labels')) {
      return [[]];
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE company_id = ?')) {
      return [[
        {
          id: 1,
          company_id: companyId,
          title: 'Old title',
          is_deleted: 1,
          deleted_by: 22,
          deleted_at: '2021-01-01 00:00:00',
          updated_by: 33,
          updated_at: '2021-01-01 00:00:00',
        },
      ]];
    }
    if (sql.startsWith('UPDATE ?? SET `is_deleted` = 1')) {
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO ??')) {
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      return [{ affectedRows: 0 }];
    }
    return [[], []];
  };

  try {
    const result = await db.seedTenantTables(companyId, null, {}, true, 5, 6, {
      backupName: 'Upsert Backup',
    });
    assert.ok(result.summary.posts);
    assert.equal(result.summary.posts.count, 1);

    const insertCall = calls.find((c) =>
      c.sql.startsWith(
        'INSERT INTO ?? (`company_id`, `id`, `title`, `is_deleted`, `deleted_by`, `deleted_at`, `updated_by`, `updated_at`)',
      ),
    );
    assert.ok(insertCall);
    assert.match(insertCall.sql, /ON DUPLICATE KEY UPDATE/);
    assert.match(insertCall.sql, /`is_deleted` = DEFAULT\(`is_deleted`\)/);
    assert.match(insertCall.sql, /`deleted_by` = DEFAULT\(`deleted_by`\)/);
    assert.match(insertCall.sql, /`deleted_at` = DEFAULT\(`deleted_at`\)/);
    assert.match(insertCall.sql, /`updated_at` = NOW\(\)/);
    assert.match(insertCall.sql, /`updated_by` = VALUES\(`updated_by`\)/);
  } finally {
    db.pool.query = origQuery;
    await fs.rm(companyConfigDir, { recursive: true, force: true });
  }
});

await test('seedTenantTables throws when table has data and overwrite false', async () => {
  const orig = db.pool.query;
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      return [[{ cnt: 5 }]];
    }
    return [[], []];
  };
  await assert.rejects(() => db.seedTenantTables(7, null, {}, false, 1), /already contains data/);
  db.pool.query = orig;
});

await test('seedDefaultsForSeedTables updates audit columns when present', async () => {
  const origQuery = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT table_name FROM tenant_tables')) {
      return [[{ table_name: 't1' }, { table_name: 't2' }]];
    }
    if (sql.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'updated_by' },
        { COLUMN_NAME: 'updated_at' },
      ]];
    }
    return [[], []];
  };
  await db.seedDefaultsForSeedTables(55);
  db.pool.query = origQuery;
  const updates = calls.filter((c) => c.sql.startsWith('UPDATE ?? SET company_id'));
  assert.equal(updates.length, 2);
  assert.match(updates[0].sql, /updated_by = \?, updated_at = NOW\(\)/);
  assert.deepEqual(updates[0].params, ['t1', 0, 55, 0]);
  assert.deepEqual(updates[1].params, ['t2', 0, 55, 0]);
});

await test('zeroSharedTenantKeys updates audit columns when present', async () => {
  const origQuery = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    const trimmed = sql.trim();
    if (trimmed.startsWith('SELECT table_name FROM tenant_tables')) {
      return [[{ table_name: 't1' }]];
    }
    if (trimmed.startsWith('SELECT COLUMN_NAME')) {
      return [[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'company_id' },
        { COLUMN_NAME: 'updated_by' },
        { COLUMN_NAME: 'updated_at' },
      ]];
    }
    if (trimmed.startsWith('SELECT COUNT(*) AS cnt')) {
      return [[{ cnt: 2 }]];
    }
    if (trimmed.startsWith('SELECT src.*')) {
      return [[]];
    }
    if (trimmed.startsWith('UPDATE')) {
      return [{ affectedRows: 2 }];
    }
    return [[], []];
  };
  const summary = await db.zeroSharedTenantKeys(77);
  db.pool.query = origQuery;
  const trimmedCalls = calls.map((c) => ({ ...c, sql: c.sql.trim() }));
  const update = trimmedCalls.find((c) =>
    c.sql.startsWith('UPDATE `t1` AS src'),
  );
  assert.ok(update);
  assert.match(update.sql, /SET src.`company_id` = \?/);
  assert.match(update.sql, /src.`updated_by` = \?/);
  assert.match(update.sql, /src.`updated_at` = NOW\(\)/);
  assert.deepEqual(update.params, [0, 77, 0]);
  assert.equal(summary.tables.length, 1);
  assert.equal(summary.tables[0].tableName, 't1');
  assert.equal(summary.tables[0].totalRows, 2);
  assert.equal(summary.tables[0].updatedRows, 2);
  assert.equal(summary.tables[0].skippedRows, 0);
  assert.deepEqual(summary.tables[0].skippedRecords, []);
  assert.equal(summary.totals.totalRows, 2);
  assert.equal(summary.totals.updatedRows, 2);
  assert.equal(summary.totals.skippedRows, 0);
});

await test('seedSeedTablesForCompanies seeds all companies', async () => {
  const origQuery = db.pool.query;
  const inserts = [];
  db.pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT id FROM companies')) {
      return [[{ id: 1 }, { id: 2 }]];
    }
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      inserts.push(params);
    }
    return [[], []];
  };
  await db.seedSeedTablesForCompanies(55);
  db.pool.query = origQuery;
  assert.deepEqual(inserts, [
    [1, 55],
    [2, 55],
  ]);
});


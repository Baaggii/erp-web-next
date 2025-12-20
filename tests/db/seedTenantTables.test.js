import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import * as db from '../../db/index.js';
import { GLOBAL_COMPANY_ID } from '../../config/0/constants.js';

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
  assert.ok(
    insertCall.sql.includes('FROM ?? AS src'),
    'source table should be aliased as src',
  );
  assert.ok(
    insertCall.sql.includes('src.`id` IN (?, ?)'),
    'primary key filter should reference the aliased column',
  );
  assert.deepEqual(insertCall.params, ['posts', 7, 'posts', 1, 2]);
  assert.deepEqual(result.summary, { posts: { count: 2, ids: [1, 2] } });
});

await test(
  'seedTenantTables filters composite primary keys by non-tenant columns',
  async () => {
    const companyId = 23;
    const origQuery = db.pool.query;
    const calls = [];
    db.pool.query = async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
        return [[{ table_name: 'status_codes', is_shared: 0 }]];
      }
      if (sql.startsWith('SELECT COUNT(*)')) {
        return [[{ cnt: 3 }]];
      }
      if (sql.startsWith('SELECT COLUMN_NAME')) {
        return [[
          { COLUMN_NAME: 'company_id', COLUMN_KEY: 'PRI', EXTRA: '' },
          { COLUMN_NAME: 'code', COLUMN_KEY: 'PRI', EXTRA: '' },
          { COLUMN_NAME: 'label', COLUMN_KEY: '', EXTRA: '' },
          { COLUMN_NAME: 'is_deleted', COLUMN_KEY: '', EXTRA: '' },
          { COLUMN_NAME: 'deleted_by', COLUMN_KEY: '', EXTRA: '' },
          { COLUMN_NAME: 'deleted_at', COLUMN_KEY: '', EXTRA: '' },
        ]];
      }
      if (
        sql.startsWith(
          'SELECT column_name, mn_label FROM table_column_labels',
        )
      ) {
        return [[]];
      }
      if (sql.startsWith('UPDATE ?? SET')) {
        return [{ affectedRows: 3 }];
      }
      if (sql.startsWith('INSERT INTO user_level_permissions')) {
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('INSERT INTO ??')) {
        return [{ affectedRows: 2 }];
      }
      return [[], []];
    };

    try {
      await fs.rm(
        path.join(process.cwd(), 'config', String(companyId)),
        { recursive: true, force: true },
      );
      const result = await db.seedTenantTables(
        companyId,
        null,
        { status_codes: ['A', 'C'] },
        true,
        99,
      );
      const insertCall = calls.find(
        (c) => c.sql.startsWith('INSERT INTO ??') && c.params?.[0] === 'status_codes',
      );
      assert.ok(insertCall);
      assert.ok(
        insertCall.sql.includes('src.`code` IN (?, ?)'),
        'should filter by the non-tenant primary key column',
      );
      assert.deepEqual(
        insertCall.params.slice(0, 5),
        ['status_codes', companyId, 'status_codes', 'A', 'C'],
      );
      assert.deepEqual(result.summary, {
        status_codes: { count: 2, ids: ['A', 'C'] },
      });
      assert.ok(
        calls.some(
          (c) =>
            c.sql.startsWith('UPDATE ?? SET') &&
            Array.isArray(c.params) &&
            c.params[c.params.length - 1] === companyId,
        ),
        'should soft delete existing rows before reseeding',
      );
    } finally {
      db.pool.query = origQuery;
      await fs.rm(
        path.join(process.cwd(), 'config', String(companyId)),
        { recursive: true, force: true },
      );
    }
  },
);

await test(
  'seedTenantTables filters tenant-only composite primary keys',
  async () => {
    const companyId = 31;
    const origQuery = db.pool.query;
    const calls = [];
    db.pool.query = async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
        return [[{ table_name: 'branches', is_shared: 0 }]];
      }
      if (sql.startsWith('SELECT COUNT(*)')) {
        return [[{ cnt: 0 }]];
      }
      if (sql.startsWith('SELECT COLUMN_NAME')) {
        return [[
          { COLUMN_NAME: 'company_id', COLUMN_KEY: 'PRI', EXTRA: '' },
          { COLUMN_NAME: 'branch_id', COLUMN_KEY: 'PRI', EXTRA: '' },
          { COLUMN_NAME: 'name', COLUMN_KEY: '', EXTRA: '' },
        ]];
      }
      if (
        sql.startsWith(
          'SELECT column_name, mn_label FROM table_column_labels',
        )
      ) {
        return [[]];
      }
      if (sql.startsWith('INSERT INTO ??')) {
        return [{ affectedRows: 2 }];
      }
      if (sql.startsWith('INSERT INTO user_level_permissions')) {
        return [{ affectedRows: 0 }];
      }
      return [[], []];
    };

    try {
      await fs.rm(
        path.join(process.cwd(), 'config', String(companyId)),
        { recursive: true, force: true },
      );
      const result = await db.seedTenantTables(
        companyId,
        null,
        { branches: [3, 7] },
        false,
        12,
      );
      const insertCall = calls.find(
        (c) => c.sql.startsWith('INSERT INTO ??') && c.params?.[0] === 'branches',
      );
      assert.ok(insertCall);
      assert.ok(
        insertCall.sql.includes('src.`branch_id` IN (?, ?)'),
        'should filter by branch_id even when it is a tenant key',
      );
      assert.deepEqual(insertCall.params.slice(0, 5), [
        'branches',
        companyId,
        'branches',
        3,
        7,
      ]);
      assert.deepEqual(result.summary, {
        branches: { count: 2, ids: [3, 7] },
      });
    } finally {
      db.pool.query = origQuery;
      await fs.rm(
        path.join(process.cwd(), 'config', String(companyId)),
        { recursive: true, force: true },
      );
    }
  },
);

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

await test(
  'seedTenantTables ignores soft-deleted rows when checking for existing data',
  async () => {
    const orig = db.pool.query;
    const calls = [];
    db.pool.query = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
        return [[{ table_name: 'posts', is_shared: 0 }]];
      }
      if (sql.startsWith('SELECT COLUMN_NAME')) {
        return [[
          { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
          { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
          { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' },
          { COLUMN_NAME: 'is_deleted', COLUMN_KEY: '', EXTRA: '' },
        ]];
      }
      if (sql.startsWith('SELECT column_name, mn_label FROM table_column_labels')) {
        return [[]];
      }
      if (sql.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?')) {
        assert.match(
          sql,
          /\(`is_deleted` IS NULL OR `is_deleted` IN \(0,''\) OR LOWER\(`is_deleted`\) IN \((\?,\s*)+\?\)\)/,
          'count query should exclude soft deleted rows',
        );
        assert.deepEqual(
          (params ?? []).slice(2),
          ['0', 'n', 'no', 'false', 'f', '0000-00-00 00:00:00', '0000-00-00'],
          'count query should include common active soft delete markers',
        );
        return [[{ cnt: 0 }]];
      }
      if (sql.startsWith('INSERT INTO ?? (`company_id`')) {
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO user_level_permissions')) {
        return [{ affectedRows: 0 }];
      }
      return [[], []];
    };

    try {
      const result = await db.seedTenantTables(5, null, {}, false, 1);
      assert.ok(result.summary.posts);
      assert.equal(result.summary.posts.count, 1);
    } finally {
      db.pool.query = orig;
    }

    const countCall = calls.find((c) =>
      c.sql.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?'),
    );
    assert.ok(countCall);
    assert.match(
      countCall.sql,
      /\(`is_deleted` IS NULL OR `is_deleted` IN \(0,''\) OR LOWER\(`is_deleted`\) IN \((\?,\s*)+\?\)\)/,
    );
    assert.deepEqual(
      (countCall.params ?? []).slice(2),
      ['0', 'n', 'no', 'false', 'f', '0000-00-00 00:00:00', '0000-00-00'],
    );
    assert.ok(
      !calls.some((c) => c.sql.startsWith('UPDATE ?? SET `is_deleted` = 1')),
    );
  },
);

await test(
  'seedTenantTables soft deletes rows when active markers use text values',
  async () => {
    const companyId = 12;
    const companyConfigDir = path.join(
      process.cwd(),
      'config',
      String(companyId),
    );
    await fs.rm(companyConfigDir, { recursive: true, force: true });

    const orig = db.pool.query;
    const calls = [];
    db.pool.query = async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
        return [[{ table_name: 'posts', is_shared: 0 }]];
      }
      if (sql.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?')) {
        const hasLower = /LOWER\(`is_deleted`\) IN/.test(sql);
        if (!hasLower) {
          return [[{ cnt: 0 }]];
        }
        assert.deepEqual(
          params.slice(2),
          ['0', 'n', 'no', 'false', 'f', '0000-00-00 00:00:00', '0000-00-00'],
          'count query should include textual active markers',
        );
        return [[{ cnt: 3 }]];
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
          { id: 1, company_id: companyId, title: 'Alpha', is_deleted: 'N' },
          { id: 2, company_id: companyId, title: 'Beta', is_deleted: 'N' },
          { id: 3, company_id: companyId, title: 'Gamma', is_deleted: 'N' },
        ]];
      }
      if (sql.startsWith('UPDATE ?? SET `is_deleted` = 1')) {
        return [{ affectedRows: 3 }];
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
      const result = await db.seedTenantTables(
        companyId,
        null,
        { posts: [2] },
        true,
        5,
      );
      assert.deepEqual(result.summary.posts, { count: 1, ids: [2] });
    } finally {
      db.pool.query = orig;
      await fs.rm(companyConfigDir, { recursive: true, force: true });
    }

    const countCall = calls.find((c) =>
      c.sql.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?'),
    );
    assert.ok(countCall);

    const updateIndex = calls.findIndex((c) =>
      c.sql.startsWith('UPDATE ?? SET `is_deleted` = 1'),
    );
    const insertIndex = calls.findIndex((c) => c.sql.startsWith('INSERT INTO ??'));
    assert.notEqual(updateIndex, -1, 'soft delete should run before reinserting rows');
    assert.notEqual(insertIndex, -1, 'insert should run for selected ids');
    assert.ok(
      updateIndex < insertIndex,
      'soft delete should occur before inserting replacement rows',
    );

    const updateCall = calls[updateIndex];
    assert.equal(updateCall.params[0], 'posts');
    assert.equal(updateCall.params.at(-1), companyId);

    const insertCall = calls[insertIndex];
    assert.ok(insertCall.sql.includes('IN (?)'), 'id filter should be applied');
    assert.deepEqual(insertCall.params.slice(0, 3), ['posts', companyId, 'posts']);
    assert.ok(insertCall.params.includes(2));
  },
);

await test(
  'seedTenantTables treats zero-date timestamps as active soft delete markers',
  async () => {
    const companyId = 96;
    const createdBy = 7;
    const updatedBy = 8;
    const companyConfigDir = path.join(process.cwd(), 'config', String(companyId));
    await fs.rm(companyConfigDir, { recursive: true, force: true });

    const zeroTimestamp = '0000-00-00 00:00:00';
    const zeroDateOnly = '0000-00-00';

    const data = {
      posts: {
        [GLOBAL_COMPANY_ID]: new Map([
          [
            1,
            {
              id: 1,
              company_id: GLOBAL_COMPANY_ID,
              title: 'Default 1',
              deleted_at: zeroTimestamp,
              deleted_by: null,
            },
          ],
          [
            2,
            {
              id: 2,
              company_id: GLOBAL_COMPANY_ID,
              title: 'Default 2',
              deleted_at: zeroTimestamp,
              deleted_by: null,
            },
          ],
        ]),
        [companyId]: new Map([
          [
            1,
            {
              id: 1,
              company_id: companyId,
              title: 'Tenant 1',
              deleted_at: zeroTimestamp,
              deleted_by: null,
            },
          ],
          [
            2,
            {
              id: 2,
              company_id: companyId,
              title: 'Tenant 2',
              deleted_at: zeroDateOnly,
              deleted_by: null,
            },
          ],
        ]),
      },
    };

    const calls = [];
    let softDeleteTimestamp = null;
    const origQuery = db.pool.query;

    db.pool.query = async (sql, params = []) => {
      calls.push({ sql, params });
      const trimmed = sql.trim();
      if (trimmed.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
        return [[{ table_name: 'posts', is_shared: 0 }]];
      }
      if (trimmed.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?')) {
        const [tableName, company] = params;
        const markers = new Set(
          params.slice(2).map((value) =>
            typeof value === 'string' ? value.toLowerCase() : String(value),
          ),
        );
        assert.ok(
          markers.has(zeroTimestamp.toLowerCase()),
          'count query should include zero-date timestamp marker',
        );
        assert.ok(
          markers.has(zeroDateOnly.toLowerCase()),
          'count query should include zero-date date marker',
        );
        const table = data[tableName] ?? {};
        const companyRows = table[company] ?? new Map();
        let count = 0;
        for (const row of companyRows.values()) {
          const value = row.deleted_at;
          if (
            value === null ||
            value === undefined ||
            value === '' ||
            value === 0 ||
            value === '0' ||
            (typeof value === 'string' && markers.has(value.toLowerCase()))
          ) {
            count += 1;
          }
        }
        return [[{ cnt: count }]];
      }
      if (trimmed.startsWith('SELECT COLUMN_NAME')) {
        return [[
          { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
          { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
          { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' },
          { COLUMN_NAME: 'deleted_at', COLUMN_KEY: '', EXTRA: '' },
          { COLUMN_NAME: 'deleted_by', COLUMN_KEY: '', EXTRA: '' },
        ]];
      }
      if (trimmed.startsWith('SELECT column_name, mn_label FROM table_column_labels')) {
        return [[]];
      }
      if (trimmed.startsWith('SELECT * FROM ?? WHERE company_id = ?')) {
        const [tableName, company] = params;
        const table = data[tableName] ?? {};
        const companyRows = table[company] ?? new Map();
        return [Array.from(companyRows.values())];
      }
      if (trimmed.startsWith('UPDATE ?? SET')) {
        const [tableName] = params;
        const targetCompany = params.at(-1);
        const clause = trimmed.slice(
          trimmed.indexOf('SET ') + 4,
          trimmed.lastIndexOf(' WHERE'),
        );
        const assignments = clause.split(',').map((part) => part.trim());
        const table = data[tableName] ?? {};
        const targetMap = table[targetCompany] ?? new Map();
        let paramIdx = 1;
        for (const assignment of assignments) {
          const match = assignment.match(/`([^`]+)`\s*=\s*\?/);
          if (match) {
            const column = match[1];
            const value = params[paramIdx++];
            if (column === 'deleted_at') {
              softDeleteTimestamp = value;
            }
            for (const row of targetMap.values()) {
              row[column] = value;
            }
          } else {
            const literal = assignment.match(/`([^`]+)`\s*=\s*(\d+)/);
            if (literal) {
              const column = literal[1];
              const value = Number(literal[2]);
              for (const row of targetMap.values()) {
                row[column] = value;
              }
            }
          }
        }
        table[targetCompany] = targetMap;
        data[tableName] = table;
        return [{ affectedRows: targetMap.size }];
      }
      if (trimmed.startsWith('INSERT INTO ??')) {
        const [tableName, targetCompany, sourceTable] = params;
        const idFilter = params.slice(3);
        const idSet = idFilter.length > 0 ? new Set(idFilter) : null;
        const table = data[tableName] ?? {};
        const targetMap = table[targetCompany] ?? new Map();
        const sourceBucket = data[sourceTable] ?? {};
        const sourceMap = sourceBucket[GLOBAL_COMPANY_ID] ?? new Map();
        let affected = 0;
        for (const [id, sourceRow] of sourceMap.entries()) {
          if (idSet && !idSet.has(id)) continue;
          affected += 1;
          const merged = { ...sourceRow, company_id: targetCompany };
          targetMap.set(id, { ...targetMap.get(id), ...merged });
        }
        table[targetCompany] = targetMap;
        data[tableName] = table;
        return [{ affectedRows: affected }];
      }
      if (trimmed.startsWith('INSERT INTO user_level_permissions')) {
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    };

    try {
      const result = await db.seedTenantTables(
        companyId,
        null,
        { posts: [1] },
        true,
        createdBy,
        updatedBy,
      );
      assert.deepEqual(result.summary.posts, { count: 1, ids: [1] });

      const countCall = calls.find((c) =>
        c.sql.trim().startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?'),
      );
      assert.ok(countCall);
      assert.ok(countCall.params.includes(zeroTimestamp));
      assert.ok(countCall.params.includes(zeroDateOnly));

      const updateIndex = calls.findIndex((c) =>
        c.sql.trim().startsWith('UPDATE ?? SET'),
      );
      const insertIndex = calls.findIndex(
        (c) => c.sql.trim().startsWith('INSERT INTO ??') && c.sql.includes('SELECT'),
      );
      assert.notEqual(updateIndex, -1, 'soft delete should run before reinserting rows');
      assert.notEqual(insertIndex, -1, 'insert should run for selected ids');
      assert.ok(updateIndex < insertIndex, 'soft delete should occur before inserting rows');

      const insertCall = calls[insertIndex];
      assert.deepEqual(insertCall.params.slice(0, 3), ['posts', companyId, 'posts']);
      assert.ok(insertCall.params.includes(1));
      assert.ok(!insertCall.params.includes(2));

      const table = data.posts ?? {};
      const tenantMap = table[companyId];
      assert.ok(tenantMap);
      const row1 = tenantMap.get(1);
      assert.ok(row1);
      assert.equal(row1.deleted_at, zeroTimestamp);
      assert.equal(row1.deleted_by, null);

      const row2 = tenantMap.get(2);
      assert.ok(row2);
      assert.equal(row2.deleted_by, updatedBy);
      assert.notEqual(row2.deleted_at, zeroTimestamp);
      assert.notEqual(row2.deleted_at, zeroDateOnly);
      assert.ok(softDeleteTimestamp);
      assert.equal(row2.deleted_at, softDeleteTimestamp);
    } finally {
      db.pool.query = origQuery;
      await fs.rm(companyConfigDir, { recursive: true, force: true });
    }
  },
);

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
    /SELECT \? AS company_id, src\.`id`, \?, NOW\(\), \?, NOW\(\)/,
  );
  assert.ok(insertCall.sql.includes('FROM ?? AS src'));
  assert.deepEqual(insertCall.params, ['posts', 7, 123, 456, 'posts']);
});

await test('seedTenantTables populates columns including deleted_at', async () => {
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
        { COLUMN_NAME: 'deleted_at', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    if (sql.startsWith('SELECT column_name, mn_label FROM table_column_labels')) {
      return [[]];
    }
    if (sql.startsWith('INSERT INTO ??')) {
      return [{ affectedRows: 3 }];
    }
    if (sql.startsWith('INSERT INTO user_level_permissions')) {
      return [{ affectedRows: 0 }];
    }
    return [[], []];
  };

  try {
    const result = await db.seedTenantTables(3, null, {}, false, 11);
    const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO ??'));
    assert.ok(insertCall);
    assert.ok(
      insertCall.sql.includes('src.`deleted_at`'),
      'deleted_at column should be selected from the source alias',
    );
    assert.deepEqual(result.summary, { posts: { count: 3 } });
  } finally {
    db.pool.query = orig;
  }
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
    assert.match(insertCall.sql, /`is_deleted` = VALUES\(`is_deleted`\)/);
    assert.match(insertCall.sql, /`deleted_by` = VALUES\(`deleted_by`\)/);
    assert.match(insertCall.sql, /`deleted_at` = VALUES\(`deleted_at`\)/);
    assert.match(insertCall.sql, /`updated_at` = NOW\(\)/);
    assert.match(insertCall.sql, /`updated_by` = VALUES\(`updated_by`\)/);
  } finally {
    db.pool.query = origQuery;
    await fs.rm(companyConfigDir, { recursive: true, force: true });
  }
});

await test(
  'seedTenantTables revives soft-deleted rows without duplicate errors',
  async () => {
    const companyId = 91;
    const createdBy = 10;
    const updatedBy = 11;

    const data = {
      posts: {
        [GLOBAL_COMPANY_ID]: new Map([
          [
            1,
            {
              id: 1,
              company_id: GLOBAL_COMPANY_ID,
              title: 'Default Title',
              is_deleted: 0,
              deleted_by: null,
              deleted_at: null,
              updated_by: 99,
              updated_at: '2024-01-01 00:00:00',
            },
          ],
        ]),
        [companyId]: new Map([
          [
            1,
            {
              id: 1,
              company_id: companyId,
              title: 'Soft deleted',
              is_deleted: 1,
              deleted_by: 22,
              deleted_at: '2023-12-31 23:59:59',
              updated_by: 33,
              updated_at: '2023-12-31 23:59:59',
            },
          ],
        ]),
      },
    };

    const calls = [];
    const origQuery = db.pool.query;
    db.pool.query = async (sql, params = []) => {
      calls.push({ sql, params });
      const trimmed = sql.trim();
      if (trimmed.startsWith('SELECT table_name, is_shared FROM tenant_tables')) {
        return [[{ table_name: 'posts', is_shared: 0 }]];
      }
      if (trimmed.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?')) {
        const [tableName, company] = params;
        const table = data[tableName] ?? {};
        const companyRows = table[company] ?? new Map();
        let count = 0;
        for (const row of companyRows.values()) {
          const value = row?.is_deleted;
          if (value === null || value === undefined || value === 0 || value === '') {
            count += 1;
          }
        }
        return [[{ cnt: count }]];
      }
      if (trimmed.startsWith('SELECT COLUMN_NAME, COLUMN_KEY, EXTRA')) {
        return [[
          { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
          { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '', COLUMN_TYPE: 'int(11)' },
          { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '', COLUMN_TYPE: 'varchar(255)' },
          { COLUMN_NAME: 'is_deleted', COLUMN_KEY: '', EXTRA: '', COLUMN_TYPE: 'tinyint(1)' },
          { COLUMN_NAME: 'deleted_by', COLUMN_KEY: '', EXTRA: '', COLUMN_TYPE: 'int(11)' },
          { COLUMN_NAME: 'deleted_at', COLUMN_KEY: '', EXTRA: '', COLUMN_TYPE: 'datetime' },
          { COLUMN_NAME: 'updated_by', COLUMN_KEY: '', EXTRA: '', COLUMN_TYPE: 'int(11)' },
          { COLUMN_NAME: 'updated_at', COLUMN_KEY: '', EXTRA: '', COLUMN_TYPE: 'datetime' },
        ]];
      }
      if (trimmed.startsWith('SELECT column_name, mn_label FROM table_column_labels')) {
        return [[]];
      }
      if (trimmed.startsWith('INSERT INTO ??')) {
        if (!trimmed.includes('ON DUPLICATE KEY')) {
          const err = new Error('Duplicate entry');
          err.code = 'ER_DUP_ENTRY';
          throw err;
        }
        if (!data.posts) data.posts = {};
        const [tableName, targetCompany] = params;
        const columnMatch = trimmed.match(/INSERT INTO \?\? \(([^)]+)\)/);
        const columns = columnMatch[1]
          .split(',')
          .map((col) => col.trim().replace(/^`|`$/g, ''));
        let paramIdx = 2;
        const explicitValues = {};
        for (const column of columns) {
          if (column === 'company_id') {
            explicitValues[column] = targetCompany;
          } else if (column === 'created_by' || column === 'updated_by') {
            explicitValues[column] = params[paramIdx++];
          } else if (column === 'created_at' || column === 'updated_at') {
            explicitValues[column] = 'NOW()';
          }
        }
        const sourceTable = params[paramIdx++];
        const idFilter = params.slice(paramIdx);
        if (!data[sourceTable]) data[sourceTable] = {};
        const sourceMap = data[sourceTable]?.[GLOBAL_COMPANY_ID] ?? new Map();
        const tableBucket = data[tableName] ?? {};
        const targetMap = tableBucket[targetCompany] ?? new Map();
        for (const [pk, sourceRow] of sourceMap.entries()) {
          if (idFilter.length > 0 && !idFilter.includes(pk)) continue;
          const merged = { ...sourceRow };
          for (const column of columns) {
            if (column === 'company_id') {
              merged[column] = targetCompany;
            } else if (explicitValues[column] !== undefined) {
              merged[column] = explicitValues[column];
            } else {
              merged[column] = sourceRow[column];
            }
          }
          const existing = targetMap.get(pk);
          if (existing) {
            for (const column of columns) {
              existing[column] = merged[column];
            }
            if (!columns.includes('deleted_by')) existing.deleted_by = null;
            if (!columns.includes('deleted_at')) existing.deleted_at = null;
            if (!columns.includes('is_deleted')) existing.is_deleted = 0;
          } else {
            targetMap.set(pk, { ...sourceRow, ...merged, company_id: targetCompany });
          }
        }
        tableBucket[targetCompany] = targetMap;
        data[tableName] = tableBucket;
        return [{ affectedRows: sourceMap.size }];
      }
      if (trimmed.startsWith('INSERT INTO user_level_permissions')) {
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    };

    try {
      const result = await db.seedTenantTables(
        companyId,
        null,
        {},
        false,
        createdBy,
        updatedBy,
      );
      const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO ??'));
      assert.ok(insertCall);
      assert.match(insertCall.sql, /ON DUPLICATE KEY UPDATE/);
      assert.match(insertCall.sql, /`deleted_by` = VALUES\(`deleted_by`\)/);
      assert.match(insertCall.sql, /`deleted_at` = VALUES\(`deleted_at`\)/);
      const revivedMap = data.posts?.[companyId];
      assert.ok(revivedMap);
      const revived = revivedMap.get(1);
      assert.ok(revived);
      assert.equal(revived.is_deleted ?? 0, 0);
      assert.equal(revived.deleted_by, null);
      assert.equal(revived.deleted_at, null);
      assert.equal(revived.title, 'Default Title');
      assert.equal(revived.updated_by, updatedBy);
      assert.equal(revived.updated_at, 'NOW()');
      assert.deepEqual(result.summary.posts, { count: 1 });
    } finally {
      db.pool.query = origQuery;
    }
  },
);

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

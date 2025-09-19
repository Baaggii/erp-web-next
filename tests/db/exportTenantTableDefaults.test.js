import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import * as db from '../../db/index.js';

await test('exportTenantTableDefaults writes SQL snapshot for shared and seed tables', async () => {
  const origQuery = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    const trimmed = sql.trim();
    calls.push({ sql: trimmed, params });
    if (trimmed.startsWith('SELECT table_name')) {
      return [[
        { table_name: 'shared_defaults', is_shared: 1, seed_on_create: 0 },
        { table_name: 'seed_defaults', is_shared: 0, seed_on_create: 1 },
      ]];
    }
    if (trimmed.startsWith('SELECT COLUMN_NAME')) {
      const tableName = params?.[0];
      if (tableName === 'shared_defaults') {
        return [[
          { COLUMN_NAME: 'company_id' },
          { COLUMN_NAME: 'id' },
          { COLUMN_NAME: 'label' },
        ]];
      }
      if (tableName === 'seed_defaults') {
        return [[
          { COLUMN_NAME: 'company_id' },
          { COLUMN_NAME: 'code' },
        ]];
      }
    }
    if (trimmed.startsWith('SELECT * FROM ?? WHERE company_id = ?')) {
      const tableName = params?.[0];
      if (tableName === 'shared_defaults') {
        return [[
          { company_id: 0, id: 1, label: 'Welcome' },
          { company_id: 0, id: 2, label: 'Goodbye' },
        ]];
      }
      if (tableName === 'seed_defaults') {
        return [[{ company_id: 0, code: 'X' }]];
      }
    }
    return [[], []];
  };

  let exportPath;
  try {
    const result = await db.exportTenantTableDefaults('Baseline Defaults', 77);
    assert.equal(result.versionName, 'baseline-defaults');
    assert.match(result.fileName, /baseline-defaults\.sql$/);
    assert.equal(result.relativePath, `defaults/${result.fileName}`);
    assert.equal(result.tableCount, 2);
    assert.equal(result.rowCount, 3);
    exportPath = path.join(process.cwd(), 'config', '0', result.relativePath);
    const fileContent = await fs.readFile(exportPath, 'utf8');
    assert.equal(fileContent, result.sql);
    assert.match(fileContent, /INSERT INTO `shared_defaults`/);
    assert.match(fileContent, /INSERT INTO `seed_defaults`/);
    assert.ok(calls.some((c) => c.sql.startsWith('SELECT table_name')));
  } finally {
    db.pool.query = origQuery;
    if (exportPath) {
      await fs.unlink(exportPath).catch(() => {});
    }
  }
});

await test('exportTenantTableDefaults rejects blank export names', async () => {
  await assert.rejects(
    () => db.exportTenantTableDefaults('   '),
    /export name is required/i,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import {
  getDisplayFields,
  setDisplayFields,
  removeDisplayFields,
} from '../../api-server/services/displayFieldConfig.js';
import { tenantConfigPath } from '../../api-server/utils/configPaths.js';
import * as db from '../../db/index.js';

function withTempFile(companyId = 0) {
  const file = tenantConfigPath('tableDisplayFields.json', companyId);
  return fs
    .readFile(file, 'utf8')
    .then((orig) => ({
      file,
      restore: () => fs.writeFile(file, orig),
      existed: true,
    }))
    .catch(() => ({
      file,
      restore: () => fs.rm(file, { force: true }),
      existed: false,
    }));
}

function mockMeta(handler) {
  const orig = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = orig;
  };
}

await test('setDisplayFields enforces limit', async (t) => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(file, '{}');
  const fields = Array.from({ length: 21 }, (_, i) => `f${i}`);
  await assert.rejects(() => setDisplayFields('tbl', { idField: 'id', displayFields: fields }));
  await restore();
});

await test('set and get display fields', async (t) => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(file, '{}');
  await setDisplayFields('tbl', { idField: 'id', displayFields: ['a', 'b'] });
  const { config: cfg } = await getDisplayFields('tbl');
  assert.deepEqual(cfg, { idField: 'id', displayFields: ['a', 'b'] });
  await restore();
});

await test('table name lookup is case-sensitive', async (t) => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(file, '{}');
  await setDisplayFields('MiXeD', { idField: 'id', displayFields: ['x'] });
  const restoreMeta = mockMeta(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      if (params[0] === 'mixed') {
        return [[
          { COLUMN_NAME: 'id2', COLUMN_KEY: 'PRI', EXTRA: '' },
          { COLUMN_NAME: 'name', COLUMN_KEY: '', EXTRA: '' },
        ]];
      }
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'x', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    return [[]];
  });
  const { config: wrong } = await getDisplayFields('mixed');
  assert.deepEqual(wrong, { idField: 'id2', displayFields: ['name'] });
  restoreMeta();
  await removeDisplayFields('mixed');
  const { config: still } = await getDisplayFields('MiXeD');
  assert.deepEqual(still, { idField: 'id', displayFields: ['x'] });
  await restore();
});

await test('removeDisplayFields deletes config', async (t) => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(file, '{}');
  await setDisplayFields('tbl', { idField: 'id', displayFields: ['x'] });
  await removeDisplayFields('tbl');
  const restoreMeta = mockMeta(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'name', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    return [[]];
  });
  const { config: cfg } = await getDisplayFields('tbl');
  restoreMeta();
  assert.deepEqual(cfg, { idField: 'id', displayFields: ['name'] });
  await restore();
});

await test('tenant-specific changes do not affect company 0', async () => {
  const base = await withTempFile(0);
  const tenant = await withTempFile(123);
  await fs.writeFile(base.file, '{}');
  await setDisplayFields('tbl', { idField: 'id', displayFields: ['y'] }, 123);
  const cfg0 = JSON.parse(await fs.readFile(base.file, 'utf8'));
  const cfg1 = JSON.parse(await fs.readFile(tenant.file, 'utf8'));
  assert.deepEqual(cfg0, {});
  assert.deepEqual(cfg1, { tbl: { idField: 'id', displayFields: ['y'] } });
  await base.restore();
  await tenant.restore();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import {
  getDisplayFields,
  setDisplayFields,
  removeDisplayFields,
  validateDisplayFieldConfig,
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
  await fs.writeFile(file, '[]');
  const fields = Array.from({ length: 21 }, (_, i) => `f${i}`);
  await assert.rejects(() =>
    setDisplayFields({ table: 'tbl', idField: 'id', displayFields: fields }),
  );
  await restore();
});

await test('set and get display fields', async (t) => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(file, '[]');
  await setDisplayFields({ table: 'tbl', idField: 'id', displayFields: ['a', 'b'] });
  const { config: cfg, entries } = await getDisplayFields('tbl');
  assert.deepEqual(cfg, { table: 'tbl', idField: 'id', displayFields: ['a', 'b'] });
  assert.equal(entries.length, 1);
  await restore();
});

await test('table name lookup is case-sensitive', async (t) => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(file, '[]');
  await setDisplayFields({ table: 'MiXeD', idField: 'id', displayFields: ['x'] });
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
  assert.deepEqual(wrong, { table: 'mixed', idField: 'id2', displayFields: ['name'] });
  restoreMeta();
  await removeDisplayFields({ table: 'mixed' });
  const { config: still } = await getDisplayFields('MiXeD');
  assert.deepEqual(still, { table: 'MiXeD', idField: 'id', displayFields: ['x'] });
  await restore();
});

await test('removeDisplayFields deletes config', async (t) => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(file, '[]');
  await setDisplayFields({ table: 'tbl', idField: 'id', displayFields: ['x'] });
  await removeDisplayFields({ table: 'tbl' });
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
  assert.deepEqual(cfg, { table: 'tbl', idField: 'id', displayFields: ['name'] });
  await restore();
});

await test('tenant-specific changes do not affect company 0', async () => {
  const base = await withTempFile(0);
  const tenant = await withTempFile(123);
  await fs.writeFile(base.file, '[]');
  await setDisplayFields({ table: 'tbl', idField: 'id', displayFields: ['y'] }, 123);
  const cfg0 = JSON.parse(await fs.readFile(base.file, 'utf8'));
  const cfg1 = JSON.parse(await fs.readFile(tenant.file, 'utf8'));
  assert.deepEqual(cfg0, []);
  assert.deepEqual(cfg1, [{ table: 'tbl', idField: 'id', displayFields: ['y'] }]);
  await base.restore();
  await tenant.restore();
});

await test('validation enforces required fields and uniqueness', async () => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(file, '[]');
  await assert.rejects(() =>
    setDisplayFields({ table: '', idField: 'id', displayFields: ['x'] }),
  );
  await assert.rejects(() =>
    setDisplayFields({ table: 'tbl', idField: '', displayFields: ['x'] }),
  );
  await assert.rejects(() =>
    setDisplayFields({ table: 'tbl', idField: 'id', displayFields: [] }),
  );
  await assert.rejects(() =>
    setDisplayFields({
      table: 'tbl',
      idField: 'id',
      filterColumn: 'c',
      displayFields: ['x'],
    }),
  );
  await setDisplayFields({
    table: 'tbl',
    idField: 'id',
    filterColumn: 'c',
    filterValue: '1',
    displayFields: ['x'],
  });
  assert.throws(() =>
    validateDisplayFieldConfig(
      {
        table: 'tbl',
        idField: 'id',
        filterColumn: 'c',
        filterValue: '1',
        displayFields: ['x'],
      },
      [{ table: 'tbl', idField: 'id', filterColumn: 'c', filterValue: '1', displayFields: ['y'] }],
    ),
  );
  await restore();
});

await test('filtered selection matches idField/target column', async () => {
  const { file, restore } = await withTempFile();
  await fs.writeFile(
    file,
    JSON.stringify([
      {
        table: 'tbl',
        idField: 'primary_id',
        filterColumn: 'status',
        filterValue: 'active',
        displayFields: ['primary'],
      },
      {
        table: 'tbl',
        idField: 'alt_id',
        filterColumn: 'status',
        filterValue: 'active',
        displayFields: ['alternate'],
      },
    ]),
  );

  const { config } = await getDisplayFields('tbl', 0, 'status', 'active', 'ALT_ID');
  assert.deepEqual(config, {
    table: 'tbl',
    idField: 'alt_id',
    filterColumn: 'status',
    filterValue: 'active',
    displayFields: ['alternate'],
  });

  await restore();
});

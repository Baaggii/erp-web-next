import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import {
  getDisplayFields,
  setDisplayFields,
  removeDisplayFields,
} from '../../api-server/services/displayFieldConfig.js';
import * as db from '../../db/index.js';

const filePath = path.join(process.cwd(), 'config', 'tableDisplayFields.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then((orig) => ({
      orig,
      restore: () => fs.writeFile(filePath, orig),
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
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const fields = Array.from({ length: 21 }, (_, i) => `f${i}`);
  await assert.rejects(() => setDisplayFields('tbl', { idField: 'id', displayFields: fields }));
  await restore();
});

await test('set and get display fields', async (t) => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setDisplayFields('tbl', { idField: 'id', displayFields: ['a', 'b'] });
  const cfg = await getDisplayFields('tbl');
  assert.deepEqual(cfg, { idField: 'id', displayFields: ['a', 'b'] });
  await restore();
});

await test('table name lookup is case-sensitive', async (t) => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
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
  const wrong = await getDisplayFields('mixed');
  assert.deepEqual(wrong, { idField: 'id2', displayFields: ['name'] });
  restoreMeta();
  await removeDisplayFields('mixed');
  const still = await getDisplayFields('MiXeD');
  assert.deepEqual(still, { idField: 'id', displayFields: ['x'] });
  await restore();
});

await test('removeDisplayFields deletes config', async (t) => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
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
  const cfg = await getDisplayFields('tbl');
  restoreMeta();
  assert.deepEqual(cfg, { idField: 'id', displayFields: ['name'] });
  await restore();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { setFormConfig } from '../../api-server/services/transactionFormConfig.js';
import * as db from '../../db/index.js';
import { slugify } from '../../api-server/utils/slugify.js';

const filePath = path.join(process.cwd(), 'config', 'transactionForms.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then((orig) => ({
      orig,
      restore: () => fs.writeFile(filePath, orig),
    }));
}

function mockPool(handler) {
  const original = db.pool.query;
  db.pool.query = async (...args) => {
    await handler(...args);
    return [{}];
  };
  return () => {
    db.pool.query = original;
  };
}

await test('setFormConfig writes moduleKey and creates modules with slug', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const calls = [];
  const restoreDb = mockPool((sql, params) => calls.push({ sql, params }));

  await setFormConfig('tbl', 'Sample Transaction', { moduleKey: 'parent_mod' });

  restoreDb();
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(data.tbl['Sample Transaction'].moduleKey, 'parent_mod');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].params[0], 'parent_mod');
  assert.equal(calls[1].params[0], slugify('Sample Transaction'));
  await restore();
});

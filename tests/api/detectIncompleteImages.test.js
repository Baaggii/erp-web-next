import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { detectIncompleteImages, fixIncompleteImages, checkUploadedImages, commitUploadedImages } from '../../api-server/services/transactionImageService.js';
import * as db from '../../db/index.js';

function mockPool(handler) {
  const orig = db.pool.query;
  db.pool.query = handler;
  return () => { db.pool.query = orig; };
}

const cfgPath = path.join(process.cwd(), 'config', 'transactionForms.json');
const baseDir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');

await test('detectIncompleteImages finds and fixes files', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  await fs.mkdir(baseDir, { recursive: true });
  const file = path.join(baseDir, 'abc12345.jpg');
  await fs.writeFile(file, 'x');

  const row = { id: 1, test_num: 'abc12345', label_field: 'num001' };

  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql)) return [[{ Field: 'test_num' }, { Field: 'label_field' }]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(cfgPath, JSON.stringify({
    transactions_test: {
      default: { imagenameField: ['label_field'], imageFolder: 'transactions_test' }
    }
  }));

  const { list, hasMore } = await detectIncompleteImages(1);
  assert.equal(hasMore, false);
  assert.equal(list.length, 1);
  assert.ok(list[0].newName.includes('num001'));

  const count = await fixIncompleteImages(list);
  assert.equal(count, 1);

  const exists = await fs.readdir(baseDir);
  assert.ok(exists.some((f) => f.includes('num001')));

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('checkUploadedImages renames on upload', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  await fs.mkdir(path.join(process.cwd(), 'uploads', 'tmp'), { recursive: true });
  const tmp = path.join(process.cwd(), 'uploads', 'tmp', 'abc12345.jpg');
  await fs.writeFile(tmp, 'x');

  const row = { id: 1, test_num: 'abc12345', label_field: 'num002' };
  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql)) return [[{ Field: 'test_num' }, { Field: 'label_field' }]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(cfgPath, JSON.stringify({
    transactions_test: {
      default: { imagenameField: ['label_field'], imageFolder: 'transactions_test' }
    }
  }));

  const { list, summary } = await checkUploadedImages([{ originalname: 'abc12345.jpg', path: tmp }]);
  assert.equal(summary.processed, 1);
  assert.equal(list.length, 1);
  assert.ok(list[0].newName.includes('num002'));

  const uploaded = await commitUploadedImages(list);
  assert.equal(uploaded, 1);
  const exists = await fs.readdir(path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test'));
  assert.ok(exists.some((f) => f.includes('num002')));

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

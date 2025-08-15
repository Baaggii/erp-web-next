import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { moveImagesToDeleted } from '../../api-server/services/transactionImageService.js';

const cfgPath = path.join(process.cwd(), 'config', 'transactionForms.json');
const baseDir = path.join(process.cwd(), 'uploads', 'txn_images');

await test.skip('moveImagesToDeleted archives images', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const row = { id: 1, label_field: 'img001' };
  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(
    cfgPath,
    JSON.stringify({
      transactions_test: { default: { imagenameField: ['label_field'], imageFolder: 'transactions_test' } },
    }),
  );
  const srcDir = path.join(baseDir, 'transactions_test');
  await fs.mkdir(srcDir, { recursive: true });
  const fileName = 'img001_123.jpg';
  await fs.writeFile(path.join(srcDir, fileName), 'x');

  const moved = await moveImagesToDeleted('transactions_test', row);
  assert.equal(moved, 1);
  const targetDir = path.join(baseDir, 'deleted_transactions');
  const files = await fs.readdir(targetDir);
  assert.ok(files.includes(fileName));
  const origFiles = await fs.readdir(srcDir).catch(() => []);
  assert.equal(origFiles.length, 0);

  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

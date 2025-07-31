import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { cleanupOldImages } from '../../api-server/services/transactionImageService.js';

const baseDir = path.join(process.cwd(), 'uploads', 'txn_images', 'test_cleanup');

test('cleanupOldImages removes old files', async () => {
  await fs.mkdir(baseDir, { recursive: true });
  const file = path.join(baseDir, 'old.txt');
  await fs.writeFile(file, 'temp');
  const oldTime = Date.now() - 40 * 24 * 60 * 60 * 1000;
  await fs.utimes(file, oldTime / 1000, oldTime / 1000);

  const removed = await cleanupOldImages(30);

  let exists = true;
  try {
    await fs.access(file);
  } catch {
    exists = false;
  }

  assert.equal(exists, false);

  await fs.rm(baseDir, { recursive: true, force: true });
});

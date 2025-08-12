import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { deleteImage } from '../../api-server/services/transactionImageService.js';

const baseDir = path.join(process.cwd(), 'uploads', 'txn_images');
const srcDir = path.join(baseDir, 'delete_image_test');
const deletedDir = path.join(baseDir, 'deleted_images');

await test('deleteImage moves file to deleted_images', { concurrency: false }, async () => {
  await fs.rm(srcDir, { recursive: true, force: true });
  await fs.rm(deletedDir, { recursive: true, force: true });
  await fs.mkdir(srcDir, { recursive: true });
  const fileName = 'img001_123.jpg';
  await fs.writeFile(path.join(srcDir, fileName), 'x');

  const ok = await deleteImage('delete_image_test', fileName, 'delete_image_test');
  assert.equal(ok, true);
  const files = await fs.readdir(deletedDir);
  assert.ok(files.includes(fileName));
  const origFiles = await fs.readdir(srcDir).catch(() => []);
  assert.equal(origFiles.length, 0);
  await fs.rm(srcDir, { recursive: true, force: true });
  await fs.rm(deletedDir, { recursive: true, force: true });
});

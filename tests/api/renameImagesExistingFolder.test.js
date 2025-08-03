import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { renameImages } from '../../api-server/services/transactionImageService.js';

const baseDir = path.join(process.cwd(), 'uploads', 'txn_images');

await test('renameImages handles images already in folder', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(baseDir, 'tool', '4001');
  await fs.mkdir(dir, { recursive: true });
  const fileName = 'old_123.jpg';
  await fs.writeFile(path.join(dir, fileName), 'x');
  const res = await renameImages('transactions_tool', 'old', 'new', 'tool/4001');
  assert.equal(res.length, 1);
  const files = await fs.readdir(dir);
  assert.ok(files.includes('new_123.jpg'));
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

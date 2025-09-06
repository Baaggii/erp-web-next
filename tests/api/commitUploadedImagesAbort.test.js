import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { commitUploadedImages } from '../../api-server/services/transactionImageService.js';

const companyId = 0;
const uploadRoot = path.join(process.cwd(), 'uploads');
const tmpDir = path.join(uploadRoot, String(companyId), 'tmp');

await test('commitUploadedImages stops when aborted', async () => {
  await fs.rm(uploadRoot, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  const list = [];
  for (let i = 0; i < 10; i += 1) {
    const tmpPath = path.join(tmpDir, `f${i}.jpg`);
    await fs.writeFile(tmpPath, 'x');
    list.push({ tmpPath, folder: 'transactions_test', newName: `n${i}.jpg` });
  }

  const controller = new AbortController();
  const origRename = fs.rename;
  let calls = 0;
  fs.rename = async (...args) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return origRename(...args);
  };

  const promise = commitUploadedImages(list, companyId, controller.signal);
  setTimeout(() => controller.abort(), 120);
  await assert.rejects(promise, { name: 'AbortError' });

  fs.rename = origRename;

  assert.ok(calls < list.length);
  const remaining = await fs.readdir(tmpDir);
  assert.ok(remaining.length > 0);

  await fs.rm(uploadRoot, { recursive: true, force: true });
});

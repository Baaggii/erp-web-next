import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { listPending, getPending, savePending, deletePending } from '../../api-server/services/posTransactionPending.js';

const filePath = path.join(process.cwd(), 'config', 'posPendingTransactions.json');

async function withTempFile() {
  const orig = await fs.readFile(filePath, 'utf8').catch(() => '{}');
  await fs.writeFile(filePath, orig);
  return {
    orig,
    restore: () => fs.writeFile(filePath, orig)
  };
}

await test('savePending stores user and filters list', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const { id } = await savePending(null, { name: 't', data: { a: 1 }, masterId: 1 }, 'user1');
  const list1 = await listPending('t', 'user1');
  assert.deepEqual(Object.keys(list1), [id]);
  assert.equal(list1[id].userId, 'user1');
  const empty = await listPending('t', 'user2');
  assert.deepEqual(empty, {});
  const rec = await getPending(id);
  assert.equal(rec.name, 't');
  await deletePending(id);
  await restore();
});

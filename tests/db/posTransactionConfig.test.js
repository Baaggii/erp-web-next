import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { setConfig, getConfig, deleteConfig } from '../../api-server/services/posTransConfig.js';

const filePath = path.join(process.cwd(), 'config', 'posTransactionConfigs.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then((orig) => ({
      orig,
      restore: () => fs.writeFile(filePath, orig),
    }));
}

await test('set and get pos transaction config', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setConfig('Sample', { table: 'tbl', multi: true });
  const cfg = await getConfig('Sample');
  assert.equal(cfg.table, 'tbl');
  assert.equal(cfg.multi, true);
  await restore();
});

await test('delete pos transaction config', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, JSON.stringify({ A: { table: 't' } }));
  await deleteConfig('A');
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(data, {});
  await restore();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { getPosConfig, setPosConfig, deletePosConfig } from '../../api-server/services/posConfig.js';

const filePath = path.join(process.cwd(), 'config', 'posTransactionConfig.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8').catch(() => null).then((orig) => ({
    orig,
    restore: async () => {
      if (orig === null) await fs.unlink(filePath).catch(() => {});
      else await fs.writeFile(filePath, orig);
    },
  }));
}

await test('set and get pos config', async () => {
  const { orig, restore } = await withTempFile();
  await setPosConfig({ linked_tables: { a: { type: 'single' } } });
  const cfg = await getPosConfig();
  assert.deepEqual(cfg.linked_tables, { a: { type: 'single' } });
  await restore();
});

await test('deletePosConfig removes file', async () => {
  const { orig, restore } = await withTempFile();
  await setPosConfig({ test: true });
  await deletePosConfig();
  const cfg = await getPosConfig();
  assert.equal(cfg.test, undefined);
  await restore();
});

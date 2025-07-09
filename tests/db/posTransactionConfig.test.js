import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import {
  getPosConfig,
  getAllPosConfigs,
  setPosConfig,
  deletePosConfig,
} from '../../api-server/services/posTransactionConfig.js';

const filePath = path.join(process.cwd(), 'config', 'posTransactionConfigs.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then((orig) => ({
      orig,
      restore: () => fs.writeFile(filePath, orig),
    }));
}

await test('set and get POS config', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setPosConfig('Sale', {
    moduleKey: 'pos_transaction_management',
    masterTable: 'transactions_pos',
    tables: [{ table: 't1', transaction: 'A', position: 'upper_left', multiRow: true }],
    calculatedFields: [{ target: 't.total', expression: 'SUM(x)' }],
    status: { beforePost: 0, afterPost: 1 },
  });
  const cfg = await getPosConfig('Sale');
  assert.equal(cfg.moduleKey, 'pos_transaction_management');
  assert.equal(cfg.masterTable, 'transactions_pos');
  assert.equal(cfg.tables[0].table, 't1');
  assert.equal(cfg.calculatedFields[0].expression, 'SUM(x)');
  assert.equal(cfg.status.afterPost, 1);
  await restore();
});

await test('deletePosConfig removes entry', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setPosConfig('Sale', { moduleKey: 'm' });
  await deletePosConfig('Sale');
  const all = await getAllPosConfigs();
  assert.deepEqual(all, {});
  await restore();
});

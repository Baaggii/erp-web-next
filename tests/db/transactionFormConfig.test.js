import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { setFormConfig, deleteFormConfig } from '../../api-server/services/transactionFormConfig.js';
import * as db from '../../db/index.js';

const filePath = path.join(process.cwd(), 'config', 'transactionForms.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then((orig) => ({
      orig,
      restore: () => fs.writeFile(filePath, orig),
    }));
}

function mockPool(handler) {
  const original = db.pool.query;
  db.pool.query = async (...args) => {
    await handler(...args);
    return [{}];
  };
  return () => {
    db.pool.query = original;
  };
}

await test('setFormConfig writes moduleKey without touching modules', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const calls = [];
  const restoreDb = mockPool((sql, params) => calls.push({ sql, params }));

  await setFormConfig('tbl', 'Sample Transaction', { moduleKey: 'parent_mod' });

  restoreDb();
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(data.tbl['Sample Transaction'].moduleKey, 'parent_mod');
  assert.equal(calls.length, 0);
  await restore();
});

await test('setFormConfig stores moduleLabel when provided', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const calls = [];
  const restoreDb = mockPool((sql, params) => calls.push({ sql, params }));

  await setFormConfig('tbl', 'Labeled', {
    moduleKey: 'parent_mod',
    moduleLabel: 'My Transactions',
  });

  restoreDb();
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(data.tbl.Labeled.moduleLabel, 'My Transactions');
  assert.equal(calls.length, 0);
  await restore();
});

await test('setFormConfig forwards sidebar/header flags', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const calls = [];
  const restoreDb = mockPool((sql, params) => calls.push({ sql, params }));

  await setFormConfig(
    'tbl',
    'Flagged',
    { moduleKey: 'parent_mod' },
    { showInSidebar: false, showInHeader: true, moduleKey: 'custom_slug' },
  );

  restoreDb();
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(data.tbl.Flagged.moduleKey, 'parent_mod');
  assert.equal(calls.length, 0);
  await restore();
});

await test('setFormConfig stores additional field lists', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setFormConfig('tbl', 'Extra', {
    moduleKey: 'parent_mod',
    totalCurrencyFields: ['tc'],
    totalAmountFields: ['ta'],
    signatureFields: ['sig'],
    headerFields: ['h'],
    mainFields: ['m'],
    footerFields: ['f'],
  });
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(data.tbl.Extra.totalCurrencyFields, ['tc']);
  assert.deepEqual(data.tbl.Extra.footerFields, ['f']);
  await restore();
});

await test('setFormConfig stores viewSource config', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setFormConfig('tbl', 'ViewCfg', {
    moduleKey: 'parent_mod',
    viewSource: { ref_id: { table: 'tbl_ref', view: 'v_ref' } },
  });
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(data.tbl.ViewCfg.viewSource, {
    ref_id: { table: 'tbl_ref', view: 'v_ref' },
  });
  await restore();
});

await test('deleteFormConfig removes entry when unused', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(
    filePath,
    JSON.stringify({ tbl: { A: { moduleKey: 'parent' } } })
  );
  const calls = [];
  const restoreDb = mockPool((sql, params) => calls.push({ sql, params }));

  await deleteFormConfig('tbl', 'A');

  restoreDb();
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(data, {});
  assert.equal(calls.length, 0);
  await restore();
});

await test('deleteFormConfig keeps other entries intact', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(
    filePath,
    JSON.stringify({ tbl: { A: { moduleKey: 'parent' }, B: { moduleKey: 'parent' } } })
  );
  const calls = [];
  const restoreDb = mockPool((sql, params) => calls.push({ sql, params }));

  await deleteFormConfig('tbl', 'A');

  restoreDb();
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.ok(!data.tbl.A);
  assert.ok(data.tbl.B);
  assert.equal(calls.length, 0);
  await restore();
});

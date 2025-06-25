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

await test('setFormConfig stores date and transaction type fields', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const restoreDb = mockPool(() => {});

  await setFormConfig('tbl', 'Configured', {
    moduleKey: 'parent',
    dateColumn: 'tran_date',
    transTypeField: 'tran_type',
    transTypeValue: '10',
    transTypeLabel: 'Sale',
  });

  restoreDb();
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(data.tbl.Configured.dateColumn, 'tran_date');
  assert.equal(data.tbl.Configured.transTypeField, 'tran_type');
  assert.equal(data.tbl.Configured.transTypeValue, '10');
  assert.equal(data.tbl.Configured.transTypeLabel, 'Sale');
  assert.equal(data.tbl.Configured.defaultValues.tran_type, '10');
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(data.tbl.Configured.defaultValues.tran_date, today);
  assert.ok(data.tbl.Configured.visibleFields.includes('tran_date'));
  assert.ok(data.tbl.Configured.visibleFields.includes('tran_type'));
  await restore();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import {
  listCustomRelations,
  listAllCustomRelations,
  saveCustomRelation,
  removeCustomRelation,
} from '../../api-server/services/tableRelationsConfig.js';
import { tenantConfigPath } from '../../api-server/utils/configPaths.js';

async function withTempConfig(companyId = 0) {
  const file = tenantConfigPath('tableRelations.json', companyId);
  try {
    const original = await fs.readFile(file, 'utf8');
    return {
      file,
      restore: () => fs.writeFile(file, original),
      existed: true,
    };
  } catch {
    return {
      file,
      restore: () => fs.rm(file, { force: true }),
      existed: false,
    };
  }
}

await test('saveCustomRelation writes entry to config file', async () => {
  const { file, restore } = await withTempConfig(0);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '{}');
  await saveCustomRelation(
    'users',
    'dept_id',
    { table: 'departments', column: 'id' },
  );
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(json, {
    users: { dept_id: { table: 'departments', column: 'id' } },
  });
  await restore();
});

await test('listCustomRelations returns stored mapping', async () => {
  const { file, restore } = await withTempConfig(5);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify({ orders: { customer_id: { table: 'customers', column: 'id' } } }),
  );
  const { config, isDefault } = await listCustomRelations('orders', 5);
  assert.equal(isDefault, false);
  assert.deepEqual(config, { customer_id: { table: 'customers', column: 'id' } });
  const all = await listAllCustomRelations(5);
  assert.deepEqual(all.config.orders.customer_id.table, 'customers');
  await restore();
});

await test('saveCustomRelation validates input', async () => {
  await assert.rejects(
    () => saveCustomRelation('users', 'dept_id', { table: '', column: 'id' }),
    /targetTable is required/,
  );
  await assert.rejects(
    () => saveCustomRelation('users', 'dept_id', { table: 'departments', column: '' }),
    /targetColumn is required/,
  );
});

await test('removeCustomRelation deletes stored value', async () => {
  const { file, restore } = await withTempConfig(7);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '{}');
  await saveCustomRelation(
    'users',
    'dept_id',
    { table: 'departments', column: 'id' },
    7,
  );
  await removeCustomRelation('users', 'dept_id', 7);
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(json, {});
  await restore();
});

await test('tenant-specific configs do not leak to other companies', async () => {
  const base = await withTempConfig(0);
  const tenant = await withTempConfig(99);
  await fs.mkdir(path.dirname(base.file), { recursive: true });
  await fs.mkdir(path.dirname(tenant.file), { recursive: true });
  await fs.writeFile(base.file, '{}');
  await saveCustomRelation(
    'users',
    'dept_id',
    { table: 'departments', column: 'id' },
    99,
  );
  const baseJson = JSON.parse(await fs.readFile(base.file, 'utf8'));
  const tenantJson = JSON.parse(await fs.readFile(tenant.file, 'utf8'));
  assert.deepEqual(baseJson, {});
  assert.deepEqual(tenantJson, {
    users: { dept_id: { table: 'departments', column: 'id' } },
  });
  await base.restore();
  await tenant.restore();
});

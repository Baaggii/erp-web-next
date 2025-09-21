import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import {
  getCustomRelations,
  getAllCustomRelations,
  setCustomRelation,
  removeCustomRelation,
} from '../../api-server/services/tableRelationsConfig.js';
import { tenantConfigPath } from '../../api-server/utils/configPaths.js';

function withTempFile(companyId = 0) {
  const file = tenantConfigPath('tableRelations.json', companyId);
  return fs
    .readFile(file, 'utf8')
    .then((orig) => ({
      file,
      restore: () => fs.writeFile(file, orig),
      existed: true,
    }))
    .catch(() => ({
      file,
      restore: () => fs.rm(file, { force: true }),
      existed: false,
    }));
}

await test('getCustomRelations returns empty config when file missing', async () => {
  const { restore } = await withTempFile();
  await fs.rm(tenantConfigPath('tableRelations.json', 0), { force: true });
  const { config, isDefault } = await getCustomRelations('orders');
  assert.deepEqual(config, {});
  assert.equal(isDefault, true);
  await restore();
});

await test('setCustomRelation validates target fields', async () => {
  const { file, restore } = await withTempFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '{}');
  await assert.rejects(() =>
    setCustomRelation('tbl', 'col', { targetColumn: 'id' }),
  );
  await assert.rejects(() =>
    setCustomRelation('tbl', 'col', { targetTable: 'users' }),
  );
  await restore();
});

await test('setCustomRelation stores relation keyed by column', async () => {
  const { file, restore } = await withTempFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '{}');
  await setCustomRelation('orders', 'user_id', {
    targetTable: 'users',
    targetColumn: 'id',
  });
  const { config } = await getCustomRelations('orders');
  assert.deepEqual(config, {
    user_id: { targetTable: 'users', targetColumn: 'id' },
  });
  await restore();
});

await test('removeCustomRelation deletes the entry and prunes empty tables', async () => {
  const { file, restore } = await withTempFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        orders: {
          user_id: { targetTable: 'users', targetColumn: 'id' },
          company_id: { targetTable: 'companies', targetColumn: 'id' },
        },
      },
      null,
      2,
    ),
  );
  await removeCustomRelation('orders', 'user_id');
  let stored = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(stored, {
    orders: { company_id: { targetTable: 'companies', targetColumn: 'id' } },
  });
  await removeCustomRelation('orders', 'company_id');
  stored = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(stored, {});
  await restore();
});

await test('tenant-specific relations do not affect base company', async () => {
  const base = await withTempFile(0);
  const tenant = await withTempFile(5);
  await fs.mkdir(path.dirname(base.file), { recursive: true });
  await fs.writeFile(base.file, '{}');
  await setCustomRelation(
    'orders',
    'user_id',
    { targetTable: 'users', targetColumn: 'id' },
    5,
  );
  const cfg0 = JSON.parse(await fs.readFile(base.file, 'utf8'));
  const cfg5 = JSON.parse(await fs.readFile(tenant.file, 'utf8'));
  assert.deepEqual(cfg0, {});
  assert.deepEqual(cfg5, {
    orders: { user_id: { targetTable: 'users', targetColumn: 'id' } },
  });
  await base.restore();
  await tenant.restore();
});

await test('getAllCustomRelations returns entire config map', async () => {
  const { file, restore } = await withTempFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        orders: { user_id: { targetTable: 'users', targetColumn: 'id' } },
      },
      null,
      2,
    ),
  );
  const { config } = await getAllCustomRelations();
  assert.deepEqual(config, {
    orders: { user_id: { targetTable: 'users', targetColumn: 'id' } },
  });
  await restore();
});

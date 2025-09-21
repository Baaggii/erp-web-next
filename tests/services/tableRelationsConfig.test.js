import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import {
  listCustomTableRelations,
  setCustomTableRelation,
  removeCustomTableRelation,
} from '../../api-server/services/tableRelationsConfig.js';

function uniqueCompanyId() {
  return 9000 + Math.floor(Math.random() * 1000000);
}

async function cleanupCompany(companyId) {
  const dir = path.join('config', String(companyId));
  await fs.rm(dir, { recursive: true, force: true });
}

test('listCustomTableRelations returns empty array when missing', async () => {
  const companyId = uniqueCompanyId();
  await cleanupCompany(companyId);
  const { relations, isDefault } = await listCustomTableRelations('orders', companyId);
  assert.deepEqual(relations, []);
  assert.equal(isDefault, true);
});

test('setCustomTableRelation persists relation to config file', async () => {
  const companyId = uniqueCompanyId();
  await cleanupCompany(companyId);
  const relation = await setCustomTableRelation(
    'orders',
    'customer_id',
    { referencedTable: 'customers', referencedColumn: 'id' },
    companyId,
  );
  assert.equal(relation.COLUMN_NAME, 'customer_id');
  assert.equal(relation.REFERENCED_TABLE_NAME, 'customers');
  assert.equal(relation.REFERENCED_COLUMN_NAME, 'id');
  assert.equal(relation.isCustom, true);
  const filePath = path.join('config', String(companyId), 'tableRelations.json');
  const file = await fs.readFile(filePath, 'utf8');
  const json = JSON.parse(file);
  assert.deepEqual(json.orders.customer_id, {
    referencedTable: 'customers',
    referencedColumn: 'id',
  });
  const listed = await listCustomTableRelations('orders', companyId);
  assert.deepEqual(listed.relations, [relation]);
  await cleanupCompany(companyId);
});

test('removeCustomTableRelation deletes stored relation', async () => {
  const companyId = uniqueCompanyId();
  await cleanupCompany(companyId);
  await setCustomTableRelation(
    'orders',
    'customer_id',
    { referencedTable: 'customers', referencedColumn: 'id' },
    companyId,
  );
  await removeCustomTableRelation('orders', 'customer_id', companyId);
  const { relations } = await listCustomTableRelations('orders', companyId);
  assert.deepEqual(relations, []);
  const filePath = path.join('config', String(companyId), 'tableRelations.json');
  const file = await fs.readFile(filePath, 'utf8');
  const json = JSON.parse(file);
  assert.equal(json.orders, undefined);
  await cleanupCompany(companyId);
});


import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMappings, addMappings } from '../../api-server/services/headerMappings.js';
import { tenantConfigPath } from '../../api-server/utils/configPaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

async function setupTenantFile(companyId, contents) {
  const dir = path.join(projectRoot, 'config', String(companyId));
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'headerMappings.json');
  await fs.writeFile(filePath, JSON.stringify(contents, null, 2));
  return filePath;
}

async function cleanupTenant(companyId) {
  const dir = tenantConfigPath('headerMappings.json', companyId);
  await fs.rm(path.dirname(dir), { recursive: true, force: true });
}

test('getMappings unwraps nested mapping containers', async () => {
  const companyId = 991;
  try {
    await setupTenantFile(companyId, {
      mappings: {
        nested_key: { en: 'Nested Label' },
      },
      meta: { lastExport: '2025-01-01' },
    });
    const map = await getMappings(['nested_key'], 'en', companyId);
    assert.equal(map.nested_key, 'Nested Label');
  } finally {
    await cleanupTenant(companyId);
  }
});

test('addMappings flattens incoming payloads before writing', async () => {
  const companyId = 992;
  try {
    await setupTenantFile(companyId, {});
    await addMappings(
      {
        mappings: {
          table_name: { en: 'Table Name' },
        },
      },
      companyId,
    );
    const filePath = tenantConfigPath('headerMappings.json', companyId);
    const stored = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(stored.table_name, { en: 'Table Name' });
    assert(!stored.mappings);
  } finally {
    await cleanupTenant(companyId);
  }
});

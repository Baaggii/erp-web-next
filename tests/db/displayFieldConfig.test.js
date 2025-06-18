import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { getDisplayFields, setDisplayFields } from '../../api-server/services/displayFieldConfig.js';

const filePath = path.join(process.cwd(), 'config', 'tableDisplayFields.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then((orig) => ({
      orig,
      restore: () => fs.writeFile(filePath, orig),
    }));
}

await test('setDisplayFields enforces limit', async (t) => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const fields = Array.from({ length: 21 }, (_, i) => `f${i}`);
  await assert.rejects(() => setDisplayFields('tbl', { idField: 'id', displayFields: fields }));
  await restore();
});

await test('set and get display fields', async (t) => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setDisplayFields('tbl', { idField: 'id', displayFields: ['a', 'b'] });
  const cfg = await getDisplayFields('tbl');
  assert.deepEqual(cfg, { idField: 'id', displayFields: ['a', 'b'] });
  await restore();
});

await test('getDisplayFields returns defaults when missing', async (t) => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  const cfg = await getDisplayFields('unknown');
  assert.deepEqual(cfg, { idField: null, displayFields: [] });
  await restore();
});

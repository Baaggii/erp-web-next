import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { setConfig } from '../../api-server/services/codingTableConfig.js';

const filePath = path.join(process.cwd(), 'config', 'codingTableConfigs.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then((orig) => ({ orig, restore: () => fs.writeFile(filePath, orig) }));
}

await test('setConfig stores viewSource mapping', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setConfig('tbl', { viewSource: { code: { table: 'tbl_code', view: 'v_code' } } });
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(data.tbl.viewSource, { code: { table: 'tbl_code', view: 'v_code' } });
  await restore();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { getRelatedDisplay, setRelatedDisplay } from '../../api-server/services/relationFieldConfig.js';

const filePath = path.join(process.cwd(), 'config', 'relationDisplayFields.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then((orig) => ({
      orig,
      restore: () => fs.writeFile(filePath, orig)
    }));
}

await test('set and get related display fields', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setRelatedDisplay('users', 'empid', ['emp_lname', 'emp_fname']);
  const cfg = await getRelatedDisplay('users', 'empid');
  assert.deepEqual(cfg, ['emp_lname', 'emp_fname']);
  await restore();
});

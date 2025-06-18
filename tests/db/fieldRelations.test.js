import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { getRelations, setRelation } from '../../api-server/services/fieldRelations.js';

const filePath = path.join(process.cwd(), 'config', 'fieldRelations.json');

function withTempFile() {
  return fs.readFile(filePath, 'utf8')
    .catch(() => '{}')
    .then(orig => ({
      orig,
      restore: () => fs.writeFile(filePath, orig),
    }));
}

await test('set and get relations', async () => {
  const { orig, restore } = await withTempFile();
  await fs.writeFile(filePath, '{}');
  await setRelation('users', 'employee_id', {
    table: 'tbl_employee',
    column: 'id',
    displayFields: ['name'],
  });
  const rel = await getRelations('users');
  assert.deepEqual(rel, {
    employee_id: { table: 'tbl_employee', column: 'id', displayFields: ['name'] },
  });
  await restore();
});

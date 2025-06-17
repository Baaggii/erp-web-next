import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import * as db from '../../db/index.js';

const filePath = path.join(process.cwd(), 'config', 'headerMappings.json');

function mockPool(handler) {
  const original = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = original;
  };
}

test('listTableColumnMeta uses header mappings when DB labels missing', async () => {
  const origContent = await fs.readFile(filePath, 'utf8');
  await fs.writeFile(filePath, JSON.stringify({ title: 'гарчиг' }));
  const restore = mockPool(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' }]];
    }
    if (sql.includes('table_column_labels')) {
      return [[]];
    }
    return [[]];
  });
  const meta = await db.listTableColumnMeta('posts');
  restore();
  await fs.writeFile(filePath, origContent);
  assert.deepEqual(meta, [
    { name: 'title', key: '', extra: '', label: 'гарчиг' },
  ]);
});

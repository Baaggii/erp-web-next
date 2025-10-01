import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import * as db from '../../db/index.js';

const filePath = path.join(process.cwd(), 'config', '0', 'headerMappings.json');

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
      return [[
        {
          COLUMN_NAME: 'title',
          COLUMN_KEY: '',
          EXTRA: '',
          PRIMARY_KEY_ORDINAL: null,
          GENERATION_EXPRESSION: null,
        },
      ]];
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
    {
      name: 'title',
      key: '',
      extra: '',
      label: 'гарчиг',
      generationExpression: null,
      primaryKeyOrdinal: null,
    },
  ]);
});

test('listTableColumnMeta includes primary key ordinal when available', async () => {
  const restore = mockPool(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        {
          COLUMN_NAME: 'id',
          COLUMN_KEY: 'PRI',
          EXTRA: 'auto_increment',
          PRIMARY_KEY_ORDINAL: 2,
          GENERATION_EXPRESSION: null,
        },
        {
          COLUMN_NAME: 'tenant_id',
          COLUMN_KEY: 'PRI',
          EXTRA: '',
          PRIMARY_KEY_ORDINAL: '1',
          GENERATION_EXPRESSION: null,
        },
      ]];
    }
    if (sql.includes('table_column_labels')) {
      return [[]];
    }
    return [[]];
  });
  const meta = await db.listTableColumnMeta('tenants');
  restore();
  assert.deepEqual(meta, [
    {
      name: 'id',
      key: 'PRI',
      extra: 'auto_increment',
      label: 'Нэгдсэн дугаар',
      generationExpression: null,
      primaryKeyOrdinal: 2,
    },
    {
      name: 'tenant_id',
      key: 'PRI',
      extra: '',
      label: 'tenant_id',
      generationExpression: null,
      primaryKeyOrdinal: 1,
    },
  ]);
});

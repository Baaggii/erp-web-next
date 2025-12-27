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
          COLUMN_TYPE: 'varchar(255)',
          DATA_TYPE: 'varchar',
          COLUMN_COMMENT: '',
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
      type: 'varchar',
      dataType: 'varchar',
      columnType: 'varchar(255)',
      columnComment: '',
      label: 'гарчиг',
      generationExpression: null,
      primaryKeyOrdinal: null,
      enumValues: [],
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
          COLUMN_TYPE: 'int',
          DATA_TYPE: 'int',
          COLUMN_COMMENT: '',
        },
        {
          COLUMN_NAME: 'tenant_id',
          COLUMN_KEY: 'PRI',
          EXTRA: '',
          PRIMARY_KEY_ORDINAL: '1',
          GENERATION_EXPRESSION: null,
          COLUMN_TYPE: 'int',
          DATA_TYPE: 'int',
          COLUMN_COMMENT: '',
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
      type: 'int',
      dataType: 'int',
      columnType: 'int',
      columnComment: '',
      label: 'Нэгдсэн дугаар',
      generationExpression: null,
      primaryKeyOrdinal: 2,
      enumValues: [],
    },
    {
      name: 'tenant_id',
      key: 'PRI',
      extra: '',
      type: 'int',
      dataType: 'int',
      columnType: 'int',
      columnComment: '',
      label: 'tenant_id',
      generationExpression: null,
      primaryKeyOrdinal: 1,
      enumValues: [],
    },
  ]);
});

test('listTableColumnMeta reads company-specific header mappings', async () => {
  const companyId = 5;
  const companyDir = path.join(process.cwd(), 'config', String(companyId));
  const companyFile = path.join(companyDir, 'headerMappings.json');

  await fs.mkdir(companyDir, { recursive: true });
  let originalContent;
  let hadOriginal = false;
  try {
    originalContent = await fs.readFile(companyFile, 'utf8');
    hadOriginal = true;
  } catch {
    hadOriginal = false;
  }

  await fs.writeFile(companyFile, JSON.stringify({ title: 'Company scoped title' }));

  const restore = mockPool(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        {
          COLUMN_NAME: 'title',
          COLUMN_KEY: '',
          EXTRA: '',
          PRIMARY_KEY_ORDINAL: null,
          GENERATION_EXPRESSION: null,
          COLUMN_TYPE: 'varchar(255)',
          DATA_TYPE: 'varchar',
          COLUMN_COMMENT: '',
        },
      ]];
    }
    if (sql.includes('table_column_labels')) {
      return [[]];
    }
    return [[]];
  });

  const meta = await db.listTableColumnMeta('posts', companyId);
  restore();

  if (hadOriginal) {
    await fs.writeFile(companyFile, originalContent);
  } else {
    await fs.rm(companyFile, { force: true });
  }

  assert.deepEqual(meta, [
    {
      name: 'title',
      key: '',
      extra: '',
      type: 'varchar',
      dataType: 'varchar',
      columnType: 'varchar(255)',
      columnComment: '',
      label: 'Company scoped title',
      generationExpression: null,
      primaryKeyOrdinal: null,
      enumValues: [],
    },
  ]);
});

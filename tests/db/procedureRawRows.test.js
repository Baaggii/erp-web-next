import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import * as db from '../../db/index.js';

function mockPool(createSql) {
  const original = db.pool.query;
  const calls = [];
  db.pool.query = async (sql) => {
    calls.push(sql);
    if (sql.startsWith('SHOW CREATE PROCEDURE')) {
      return [[{ 'Create Procedure': createSql }]];
    }
    if (/information_schema\.COLUMNS/i.test(sql)) {
      return [
        [
          { COLUMN_NAME: 'id', COLUMN_TYPE: 'int', DATA_TYPE: 'int' },
          { COLUMN_NAME: 'region', COLUMN_TYPE: 'varchar(255)', DATA_TYPE: 'varchar' },
          { COLUMN_NAME: 'category', COLUMN_TYPE: 'varchar(255)', DATA_TYPE: 'varchar' },
          { COLUMN_NAME: 'trans_date', COLUMN_TYPE: 'date', DATA_TYPE: 'date' },
          { COLUMN_NAME: 'name', COLUMN_TYPE: 'varchar(255)', DATA_TYPE: 'varchar' },
        ],
      ];
    }
    return [[{ category: 'Phones', total: 100, id: 5, region: 'West' }]];
  };
  return () => {
    db.pool.query = original;
    return calls;
  };
}

test('getProcedureRawRows expands alias and removes aggregates', { concurrency: false }, async () => {
  const createSql = `CREATE PROCEDURE \`sp_test\`()
BEGIN
  SELECT c.name AS category, SUM(t.amount) AS total, SUM(t.count) AS cnt
  FROM trans t
  JOIN categories c ON c.id = t.category_id
  WHERE t.date BETWEEN start_date AND end_date
  GROUP BY c.name;
  SELECT 'after';
END`;
  const restore = mockPool(createSql);
  const { sql } = await db.getProcedureRawRows(
    'sp_test',
    { start_date: '2024-01-01', end_date: '2024-01-31' },
    'total',
    'category',
    'Phones',
  );
  restore();
  assert.ok(sql.includes('t.amount AS total'));
  assert.ok(!/\bcnt\b/i.test(sql));
  assert.ok(sql.includes("'2024-01-01'"));
  assert.ok(!/GROUP BY/i.test(sql));
  assert.ok(!/HAVING/i.test(sql));
  assert.ok(!/SUM\(/i.test(sql));
  assert.ok(/after/i.test(sql));
  await fs.unlink(path.join(process.cwd(), 'config', 'sp_test_rows.sql')).catch(() => {});
});

test('getProcedureRawRows handles nested SUM expressions', { concurrency: false }, async () => {
  const createSql = `CREATE PROCEDURE \`sp_case\`()
BEGIN
  SELECT t.id, t.name,
         SUM(CASE WHEN t.type = 'a' THEN IFNULL(t.val,0) ELSE 0 END) AS a_val,
         SUM(CASE WHEN t.type = 'b' THEN IFNULL(t.val,0) ELSE 0 END) AS b_val
  FROM trans t;
END`;
  const restore = mockPool(createSql);
  const { sql } = await db.getProcedureRawRows(
    'sp_case',
    {},
    'b_val',
    'id',
    5,
  );
  restore();
  assert.ok(
    sql.includes("CASE WHEN t.type = 'b' THEN IFNULL(t.val,0) ELSE 0 END AS b_val"),
  );
  assert.ok(!/\ba_val\b/i.test(sql));
  assert.ok(!/SUM\(/i.test(sql));
  assert.ok(sql.includes("id = 5"));
  await fs.unlink(path.join(process.cwd(), 'config', 'sp_case_rows.sql')).catch(() => {});
});

test(
  'getProcedureRawRows appends visibleFields from all configs and returns displayFields',
  { concurrency: false },
  async () => {
    const origRead = fs.readFile;
    fs.readFile = async (p, enc) => {
      if (p.endsWith(path.join('config', 'transactionForms.json'))) {
        return JSON.stringify({
          trans: {
            general: {
              A: {
                visibleFields: ['id'],
                headerFields: ['hdr'],
                mainFields: ['main'],
                footerFields: ['ftr'],
              },
              subgroup: { B: { visibleFields: ['note'] } },
            },
          },
        });
      }
      if (p.endsWith(path.join('config', 'tableDisplayFields.json'))) {
        return JSON.stringify({
          trans: { idField: 'id', displayFields: ['id', 'note', 'hdr', 'main', 'ftr'] },
        });
      }
      return origRead(p, enc);
    };
    const createSql = `CREATE PROCEDURE \`sp_vis\`()
BEGIN
  SELECT tr.category, SUM(tr.amount) AS total
  FROM (SELECT * FROM trans) tr
  GROUP BY tr.category;
END`;
    const restore = mockPool(createSql);
    const { sql, displayFields } = await db.getProcedureRawRows(
      'sp_vis',
      {},
      'total',
      'category',
      'Phones',
    );
    restore();
    fs.readFile = origRead;
    assert.ok(sql.includes('tr.id'));
    assert.ok(sql.includes('tr.note'));
    assert.ok(sql.includes('tr.hdr'));
    assert.ok(sql.includes('tr.main'));
    assert.ok(sql.includes('tr.ftr'));
    assert.deepEqual(displayFields, ['id', 'note', 'hdr', 'main', 'ftr']);
    await fs
      .unlink(path.join(process.cwd(), 'config', 'sp_vis_rows.sql'))
      .catch(() => {});
  },
);

test('getProcedureRawRows applies extraConditions from primary table only', {
  concurrency: false,
}, async () => {
  const createSql = `CREATE PROCEDURE \`sp_multi\`()
BEGIN
  SELECT t.id, t.region, c.name, SUM(t.amount) AS total
  FROM trans t
  JOIN categories c ON c.id = t.category_id
  GROUP BY t.id, t.region, c.name;
END`;
  const restore = mockPool(createSql);
  const { sql } = await db.getProcedureRawRows(
    'sp_multi',
    {},
    'total',
    'region',
    'West',
    [
      { field: 'id', value: 5 },
      { field: 'name', value: 'Phones' },
    ],
  );
  restore();
  assert.ok(sql.includes("region = 'West'"));
  assert.ok(sql.includes('id = 5'));
  assert.ok(!sql.includes("name = 'Phones'"));
  await fs.unlink(path.join(process.cwd(), 'config', 'sp_multi_rows.sql')).catch(() => {});
});

test('getProcedureRawRows formats date conditions', { concurrency: false }, async () => {
  const createSql = `CREATE PROCEDURE \`sp_date\`()
BEGIN
  SELECT t.trans_date, SUM(t.amount) AS total
  FROM trans t
  GROUP BY t.trans_date;
END`;
  const restore = mockPool(createSql);
  const { sql } = await db.getProcedureRawRows(
    'sp_date',
    {},
    'total',
    'trans_date',
    '2025-08-12T00:00:00.000Z',
  );
  restore();
  assert.ok(sql.includes("trans_date = '2025-08-12'"));
  await fs.unlink(path.join(process.cwd(), 'config', 'sp_date_rows.sql')).catch(() => {});
});

test('getProcedureRawRows ignores groupField from joined tables', { concurrency: false }, async () => {
  const createSql = `CREATE PROCEDURE \`sp_join\`()
BEGIN
  SELECT t.id, c.name, SUM(t.amount) AS total
  FROM trans t
  JOIN categories c ON c.id = t.category_id
  GROUP BY t.id, c.name;
END`;
  const restore = mockPool(createSql);
  const { sql } = await db.getProcedureRawRows(
    'sp_join',
    {},
    'total',
    'name',
    'Phones',
  );
  restore();
  assert.ok(!sql.includes("name = 'Phones'"));
  await fs.unlink(path.join(process.cwd(), 'config', 'sp_join_rows.sql')).catch(() => {});
});

test('getProcedureRawRows formats values based on column types', { concurrency: false }, async () => {
  const createSql = `CREATE PROCEDURE \`sp_types\`()
BEGIN
  SELECT t.id, t.region
  FROM trans t;
END`;
  const restore = mockPool(createSql);
  const { sql } = await db.getProcedureRawRows(
    'sp_types',
    {},
    'id',
    'id',
    '5',
    [{ field: 'region', value: 7 }],
  );
  restore();
  assert.ok(sql.includes('id = 5'));
  assert.ok(sql.includes("region = '7'"));
  await fs.unlink(path.join(process.cwd(), 'config', 'sp_types_rows.sql')).catch(() => {});
});

test('getProcedureRawRows ignores aggregate columns in extraConditions', { concurrency: false }, async () => {
  const createSql = `CREATE PROCEDURE \`sp_agg\`()
BEGIN
  SELECT t.id, SUM(t.amount) AS total
  FROM trans t
  GROUP BY t.id;
END`;
  const restore = mockPool(createSql);
  const { sql } = await db.getProcedureRawRows(
    'sp_agg',
    {},
    'total',
    'id',
    5,
    [{ field: 'total', value: 100 }],
  );
  restore();
  assert.ok(!sql.includes('total ='));
  await fs.unlink(path.join(process.cwd(), 'config', 'sp_agg_rows.sql')).catch(() => {});
});

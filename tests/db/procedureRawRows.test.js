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
    return [[{ category: 'Phones', total: 100 }]];
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
  assert.ok(sql.includes("category = 'Phones'"));
  assert.ok(sql.includes("'2024-01-01'"));
  assert.ok(!/GROUP BY/i.test(sql));
  assert.ok(!/HAVING/i.test(sql));
  assert.ok(!/SUM\(/i.test(sql));
  assert.ok(/^SELECT \* FROM \(/i.test(sql));
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
          Foo: {
            A: { mainFields: ['trans'], visibleFields: ['id', 'note'] },
          },
          Bar: {
            B: { mainFields: ['trans'], visibleFields: ['date', 'note'] },
          },
        });
      }
      if (p.endsWith(path.join('config', 'tableDisplayFields.json'))) {
        return JSON.stringify({
          trans: { idField: 'id', displayFields: ['id', 'note', 'date'] },
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
    assert.ok(sql.includes('tr.date'));
    assert.deepEqual(displayFields, ['id', 'note', 'date']);
    await fs
      .unlink(path.join(process.cwd(), 'config', 'sp_vis_rows.sql'))
      .catch(() => {});
  },
);

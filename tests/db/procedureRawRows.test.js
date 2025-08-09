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

test('getProcedureRawRows expands alias and removes aggregates', async () => {
  const createSql = `CREATE PROCEDURE \`sp_test\`()
BEGIN
  SELECT c.name AS category, SUM(t.amount) AS total, SUM(t.count) AS cnt
  FROM trans t
  JOIN categories c ON c.id = t.category_id
  WHERE t.date BETWEEN start_date AND end_date
  GROUP BY c.name;
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
  assert.ok(sql.includes("c.name = 'Phones'"));
  assert.ok(sql.includes("'2024-01-01'"));
  assert.ok(!/GROUP BY/i.test(sql));
  assert.ok(!/HAVING/i.test(sql));
  assert.ok(!/SUM\(/i.test(sql));
  await fs.unlink(path.join(process.cwd(), 'config', 'sp_test_rows.sql')).catch(() => {});
});

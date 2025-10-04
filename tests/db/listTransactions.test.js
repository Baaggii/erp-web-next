import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test(
  'listTransactions attaches lock metadata for non-prefixed tables',
  async () => {
    const queries = [];
    const originalQuery = db.pool.query;
    db.pool.query = async (sql, params) => {
      const text = typeof sql === 'string' ? sql : sql?.sql || '';
      queries.push({ sql: text, params });
      if (/^SELECT COUNT\(\*\)/.test(text)) {
        return [[{ count: 1 }]];
      }
      if (text.startsWith('SELECT * FROM `custom_table`')) {
        return [[{ id: 42, amount: 17 }]];
      }
      if (text.includes('FROM report_transaction_locks')) {
        return [
          [
            {
              table_name: 'custom_table',
              record_id: '42',
              status: 'pending',
              request_id: 'req-1',
              updated_at: '2024-01-01T00:00:00.000Z',
            },
          ],
        ];
      }
      throw new Error(`Unexpected query: ${text}`);
    };
    try {
      const result = await db.listTransactions({
        table: 'custom_table',
        company_id: 5,
      });
      assert.equal(result.count, 1);
      assert.equal(result.rows.length, 1);
      const row = result.rows[0];
      assert.equal(row.locked, true);
      assert.equal(row.lockMetadata.status, 'pending');
    } finally {
      db.pool.query = originalQuery;
    }
    const lockQuery = queries.find((q) => q.sql.includes('report_transaction_locks'));
    assert.ok(lockQuery, 'should query lock metadata for the table');
    assert.deepEqual(lockQuery.params, ['custom_table', 5, '42', 'locked', 'pending']);
  },
);

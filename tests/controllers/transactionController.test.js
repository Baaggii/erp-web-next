import test from 'node:test';
import assert from 'node:assert/strict';
import * as controller from '../../api-server/controllers/transactionController.js';
import * as db from '../../db/index.js';

test('getTransactions forwards enriched lock metadata', async (t) => {
  const queries = [];
  t.mock.method(db.pool, 'query', async (sql, params) => {
    const text = typeof sql === 'string' ? sql : sql?.sql || '';
    queries.push({ sql: text, params });
    if (/^SELECT COUNT\(\*\)/.test(text)) {
      return [[{ count: 1 }]];
    }
    if (text.startsWith('SELECT * FROM `custom_table`')) {
      return [[{ id: 7, amount: 99 }]];
    }
    if (text.includes('FROM report_transaction_locks')) {
      return [
        [
          {
            table_name: 'custom_table',
            record_id: '7',
            status: 'pending',
            request_id: 'req-5',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ],
      ];
    }
    throw new Error(`Unexpected query: ${text}`);
  });
  const req = {
    query: {
      table: 'custom_table',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      branchId: '5',
      page: '2',
      perPage: '25',
      refCol: 'batch_id',
      refVal: '42',
    },
    user: { companyId: 88 },
  };
  const res = {
    json(payload) {
      this.payload = payload;
    },
  };
  await controller.getTransactions(req, res, (err) => {
    if (err) throw err;
  });
  assert.equal(res.payload.count, 1);
  assert.equal(res.payload.rows.length, 1);
  const row = res.payload.rows[0];
  assert.equal(row.id, 7);
  assert.equal(row.locked, true);
  assert.equal(row.lockMetadata.status, 'pending');
  const lockQuery = queries.find((q) => q.sql.includes('report_transaction_locks'));
  assert.ok(lockQuery, 'should request lock metadata within controller');
  assert.deepEqual(lockQuery.params, ['custom_table', 88, '7', 'locked', 'pending']);
});

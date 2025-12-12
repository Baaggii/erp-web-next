import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';
import {
  buildChainIdsForUpdate,
  getTemporarySummary,
  sanitizeCleanedValuesForInsert,
} from '../../api-server/services/transactionTemporaries.js';

function mockQuery(handler) {
  const original = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = original;
  };
}

test('getTemporarySummary marks reviewers even without pending temporaries', async () => {
  const restore = mockQuery(async (sql) => {
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) {
      return [[], []];
    }
    if (sql.startsWith('SELECT * FROM `transaction_temporaries`')) {
      const now = new Date().toISOString();
      if (sql.includes('plan_senior_empid = ?')) {
        return [
          [
            {
              id: 1,
              company_id: 1,
              table_name: 'transactions_contract',
              form_name: null,
              config_name: null,
              module_key: null,
              payload_json: '{}',
              cleaned_values_json: '{}',
              raw_values_json: '{}',
              created_by: 'EMP002',
              plan_senior_empid: 'EMP001',
              branch_id: null,
              department_id: null,
              status: 'approved',
              review_notes: null,
              reviewed_by: null,
              reviewed_at: null,
              promoted_record_id: null,
              created_at: now,
              updated_at: now,
            },
          ],
        ];
      }
      return [[]];
    }
    if (sql.includes('WHERE created_by = ?')) {
      return [[{ pending_cnt: 0, total_cnt: 1 }]];
    }
    if (sql.includes('WHERE plan_senior_empid = ?')) {
      return [[{ pending_cnt: 0, total_cnt: 2 }]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  try {
    const summary = await getTemporarySummary('EMP001', 1);
    assert.equal(summary.createdPending, 0);
    assert.equal(summary.reviewPending, 0);
    assert.equal(summary.isReviewer, true);
  } finally {
    restore();
  }
});

test('sanitizeCleanedValuesForInsert trims oversized string values and records warnings', async () => {
  const columns = [
    { name: 'g_burtgel_id', type: 'varchar', maxLength: 10 },
    { name: 'g_id', type: 'int', maxLength: null },
  ];
  const input = {
    g_burtgel_id: ' 123456789012345 ',
    rows: [{ dummy: true }],
  };

  const result = await sanitizeCleanedValuesForInsert(
    'transactions_contract',
    input,
    columns,
  );

  assert.deepEqual(result.values, { g_burtgel_id: '1234567890' });
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].column, 'g_burtgel_id');
  assert.equal(result.warnings[0].type, 'maxLength');
  assert.equal(result.warnings[0].maxLength, 10);
  assert.equal(result.warnings[0].actualLength, 15);
});

test('buildChainIdsForUpdate includes root and parent temporaries when forwarding', () => {
  const forwardMeta = {
    chainIds: ['10'],
    rootTemporaryId: '1',
    parentTemporaryId: '2',
  };

  const chainIds = buildChainIdsForUpdate(forwardMeta, 3);

  assert.deepEqual(chainIds.sort((a, b) => a - b), [1, 2, 3, 10]);
});

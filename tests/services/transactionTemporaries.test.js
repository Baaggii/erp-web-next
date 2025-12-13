import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';
import {
  expandForwardMeta,
  buildChainIdsForUpdate,
  getTemporarySummary,
  sanitizeCleanedValuesForInsert,
  resolveChainIdsForUpdate,
  promoteTemporarySubmission,
} from '../../api-server/services/transactionTemporaries.js';

function mockQuery(handler) {
  const original = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = original;
  };
}

function createStubConnection({ temporaryRow, chainIds = [] } = {}) {
  const queries = [];
  const conn = {
    released: false,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) {
        return [[], []];
      }
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return [[], []];
      }
      if (sql.startsWith('SELECT * FROM `transaction_temporaries` WHERE id = ?')) {
        return [[temporaryRow]];
      }
      if (sql.includes('SELECT id FROM `transaction_temporaries` WHERE id IN')) {
        const rows = chainIds
          .filter((id) => params.includes(id))
          .map((id) => ({ id }));
        return [rows];
      }
      if (sql.startsWith('INSERT INTO `transaction_temporaries`')) {
        return [[{ insertId: 202 }]];
      }
      if (sql.startsWith('UPDATE `transaction_temporaries`')) {
        return [[{ affectedRows: 1 }]];
      }
      if (sql.startsWith('SET @skip_triggers')) {
        return [[], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      this.released = true;
    },
  };
  return { conn, queries };
}

test('getTemporarySummary marks reviewers even without pending temporaries', async () => {
  const queries = [];
  const restore = mockQuery(async (sql) => {
    queries.push(sql);
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) {
      return [[], []];
    }
    if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) {
      return [[{ CONSTRAINT_NAME: 'missing' }]];
    }
    if (sql.startsWith('ALTER TABLE `transaction_temporaries`')) {
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
    assert.ok(
      queries.some((sql) => sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')),
    );
    assert.ok(queries.some((sql) => sql.startsWith('ALTER TABLE `transaction_temporaries`')));
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

test('expandForwardMeta preserves existing chain metadata while normalizing current links', () => {
  const forwardMeta = {
    chainIds: ['10'],
    rootTemporaryId: '1',
    parentTemporaryId: '2',
    originCreator: null,
  };

  const updated = expandForwardMeta(forwardMeta, {
    currentId: 3,
    createdBy: 'emp123',
  });

  assert.equal(updated.rootTemporaryId, 1);
  assert.equal(updated.parentTemporaryId, 3);
  assert.equal(updated.originCreator, 'EMP123');
  assert.deepEqual(updated.chainIds.sort((a, b) => a - b), [1, 2, 3, 10]);
});

test('resolveChainIdsForUpdate filters missing temporaries and locks rows', async () => {
  const seen = [];
  const conn = {
    async query(sql, params = []) {
      seen.push(sql);
      if (sql.includes('SELECT id FROM')) {
        return [[{ id: 1 }, { id: 3 }]];
      }
      return [[], []];
    },
  };

  const chain = await resolveChainIdsForUpdate(
    conn,
    { chainIds: [1, 2, 3], parentTemporaryId: 1 },
    3,
  );

  assert.deepEqual(chain, [1, 3]);
  assert.ok(seen.some((sql) => sql.includes('FOR UPDATE')));
});

test('promoteTemporarySubmission forwards chain with normalized metadata and clears reviewers', async () => {
  const temporaryRow = {
    id: 3,
    company_id: 1,
    table_name: 'transactions_test',
    form_name: null,
    config_name: null,
    module_key: null,
    payload_json: JSON.stringify({ forwardMeta: { chainIds: [5], rootTemporaryId: 1, parentTemporaryId: 2 } }),
    cleaned_values_json: '{}',
    raw_values_json: '{}',
    created_by: 'EMP150',
    plan_senior_empid: 'EMP100',
    branch_id: null,
    department_id: null,
    status: 'pending',
  };
  const chainUpdates = [];
  const notifications = [];
  const { conn, queries } = createStubConnection({
    temporaryRow,
    chainIds: [1, 2, 3, 5],
  });

  const result = await promoteTemporarySubmission(
    3,
    { reviewerEmpId: 'EMP100', cleanedValues: { amount: 10 }, promoteAsTemporary: true },
    {
      connectionFactory: async () => conn,
      columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
      employmentSessionFetcher: async () => ({ senior_empid: 'EMP300' }),
      chainStatusUpdater: async (_c, ids, payload) => chainUpdates.push({ ids, payload }),
      notificationInserter: async (_c, payload) => notifications.push(payload),
      activityLogger: async () => {},
    },
  );

  assert.equal(result.forwardedTo, 'EMP300');
  assert.ok(chainUpdates.length > 0);
  assert.deepEqual(chainUpdates[0].ids.sort((a, b) => a - b), [1, 2, 3, 5]);
  assert.equal(chainUpdates[0].payload.clearReviewerAssignment, true);
  assert.equal(chainUpdates[0].payload.status, 'promoted');
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO `transaction_temporaries`')));
  assert.ok(conn.released);
});

test('promoteTemporarySubmission promotes chain and records promotedRecordId', async () => {
  const temporaryRow = {
    id: 7,
    company_id: 1,
    table_name: 'transactions_test',
    form_name: null,
    config_name: null,
    module_key: null,
    payload_json: JSON.stringify({ forwardMeta: { chainIds: [8], rootTemporaryId: 6 } }),
    cleaned_values_json: '{}',
    raw_values_json: '{}',
    created_by: 'EMP150',
    plan_senior_empid: 'EMP100',
    branch_id: null,
    department_id: null,
    status: 'pending',
  };
  const chainUpdates = [];
  const notifications = [];
  const { conn, queries } = createStubConnection({
    temporaryRow,
    chainIds: [6, 7, 8],
  });

  const result = await promoteTemporarySubmission(
    7,
    { reviewerEmpId: 'EMP100', cleanedValues: { amount: 25 } },
    {
      connectionFactory: async () => conn,
      columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
      tableInserter: async () => ({ id: 909 }),
      chainStatusUpdater: async (_c, ids, payload) => chainUpdates.push({ ids, payload }),
      notificationInserter: async (_c, payload) => notifications.push(payload),
      activityLogger: async () => {},
    },
  );

  assert.equal(result.promotedRecordId, '909');
  assert.ok(chainUpdates.length > 0);
  assert.deepEqual(chainUpdates[0].ids.sort((a, b) => a - b), [6, 7, 8]);
  assert.equal(chainUpdates[0].payload.promotedRecordId, '909');
  assert.equal(chainUpdates[0].payload.clearReviewerAssignment, true);
  assert.ok(queries.some(({ sql }) => sql.includes('UPDATE `transaction_temporaries`')));
  assert.ok(conn.released);
});

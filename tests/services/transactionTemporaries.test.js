import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';
import {
  createTemporarySubmission,
  getTemporarySummary,
  sanitizeCleanedValuesForInsert,
  promoteTemporarySubmission,
  getTemporaryChainHistory,
  listTemporarySubmissions,
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
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
        return [[{ COLUMN_NAME: 'chain_id' }, { COLUMN_NAME: 'is_pending' }]];
      }
      if (sql.includes('idx_temp_chain_pending')) {
        return [[{ INDEX_NAME: 'idx_temp_chain_pending' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
        return [[{ INDEX_NAME: 'idx_temp_status_plan_senior' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) {
        return [[{ CONSTRAINT_NAME: 'chk_temp_pending_reviewer' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.TRIGGERS')) {
        return [[{ TRIGGER_NAME: 'trg_temp_clear_reviewer' }]];
      }
      if (sql.includes('SET chain_id = id WHERE chain_id IS NULL')) {
        return [[], []];
      }
      if (sql.startsWith('UPDATE `transaction_temporaries` SET chain_id = id WHERE id = ?')) {
        return [[], []];
      }
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return [[], []];
      }
      if (sql.startsWith('ALTER TABLE `transaction_temporaries`')) {
        return [[], []];
      }
      if (sql.startsWith('SELECT * FROM `transaction_temporaries` WHERE id = ?')) {
        return [[temporaryRow]];
      }
      if (sql.includes("WHERE chain_id = ? AND status = 'pending'")) {
        return [[]];
      }
      if (sql.includes('SELECT id FROM `transaction_temporaries` WHERE id IN')) {
        const rows = chainIds
          .filter((id) => params.includes(id))
          .map((id) => ({ id }));
        return [rows];
      }
      if (sql.startsWith('SELECT DISTINCT created_by FROM `transaction_temporaries` WHERE chain_id = ?')) {
        return [[{ created_by: temporaryRow?.created_by || null }]];
      }
      if (sql.startsWith('INSERT INTO `transaction_temporaries`')) {
        return [[{ insertId: 202 }]];
      }
      if (sql.startsWith('INSERT INTO `transaction_temporary_review_history`')) {
        return [[{ insertId: 301 }]];
      }
      if (sql.startsWith('INSERT INTO user_activity_log')) {
        return [[{ insertId: 401 }]];
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
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
        return [[{ COLUMN_NAME: 'chain_id' }, { COLUMN_NAME: 'is_pending' }]];
      }
      if (sql.includes('idx_temp_chain_pending')) {
        return [[{ INDEX_NAME: 'idx_temp_chain_pending' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) {
        return [[{ CONSTRAINT_NAME: 'missing' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
        return [[{ INDEX_NAME: 'idx_temp_status_plan_senior' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.TRIGGERS')) {
        return [[{ TRIGGER_NAME: 'trg_temp_clear_reviewer' }]];
      }
    if (sql.startsWith('ALTER TABLE `transaction_temporaries`')) {
      return [[], []];
    }
    if (sql.startsWith('ALTER TABLE `transaction_temporary_review_history`')) {
      return [[], []];
    }
    if (
      sql.startsWith(
        'UPDATE `transaction_temporary_review_history` SET chain_id = temporary_id WHERE chain_id IS NULL',
      )
    ) {
      return [[], []];
    }
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS `transaction_temporary_review_history`')) {
      return [[], []];
    }
    if (sql.includes('FROM filtered')) {
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
      if (sql.includes('created_by = ?')) {
        return [[]];
      }
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
    assert.ok(queries.some((sql) => sql.includes('INFORMATION_SCHEMA.STATISTICS')));
    assert.ok(queries.some((sql) => sql.includes('INFORMATION_SCHEMA.TRIGGERS')));
    assert.ok(
      queries.some((sql) =>
        sql.startsWith('CREATE TABLE IF NOT EXISTS `transaction_temporary_review_history`'),
      ),
    );
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

test('createTemporarySubmission ignores plan senior for reviewer assignment', async () => {
  const { conn, queries } = createStubConnection();
  const notifications = [];
  const originalGetConnection = db.pool.getConnection;
  db.pool.getConnection = async () => conn;

  try {
    const result = await createTemporarySubmission(
      {
        tableName: 'transactions_contract',
        payload: {},
        rawValues: {},
        cleanedValues: {},
        companyId: 1,
        createdBy: 'EMP009',
      },
      {
        employmentSessionFetcher: async () => ({
          senior_empid: null,
          senior_plan_empid: 'PLAN9',
        }),
        notificationInserter: async (_c, payload) => notifications.push(payload),
      },
    );

    assert.equal(result.reviewerEmpId, null);
    assert.equal(result.planSenior, null);
    assert.ok(
      queries.some(({ sql }) =>
        typeof sql === 'string' && sql.startsWith('INSERT INTO `transaction_temporaries`'),
      ),
    );
    assert.equal(notifications.length, 0);
    assert.equal(conn.released, true);
  } finally {
    db.pool.getConnection = originalGetConnection;
  }
});

test('createTemporarySubmission uses provided chainId when supplied', async () => {
  const { conn, queries } = createStubConnection();
  const originalGetConnection = db.pool.getConnection;
  db.pool.getConnection = async () => conn;

  try {
    const result = await createTemporarySubmission(
      {
        tableName: 'transactions_contract',
        payload: {},
        rawValues: {},
        cleanedValues: {},
        chainId: '303',
        companyId: 1,
        createdBy: 'EMP010',
      },
      {
        employmentSessionFetcher: async () => ({
          senior_empid: null,
          senior_plan_empid: null,
        }),
      },
    );

    assert.equal(result.chainId, 303);
    const insertQuery = queries.find(({ sql }) =>
      typeof sql === 'string' && sql.startsWith('INSERT INTO `transaction_temporaries`'),
    );
    assert.ok(insertQuery);
    assert.equal(insertQuery.params[12], 303);
  } finally {
    db.pool.getConnection = originalGetConnection;
  }
});

test('listTemporarySubmissions filters before grouping by chain', async () => {
  const now = new Date().toISOString();
  const temporaries = [
    {
      id: 101,
      company_id: 1,
      table_name: 'transactions_contract',
      form_name: null,
      config_name: null,
      module_key: null,
      payload_json: '{}',
      raw_values_json: '{}',
      cleaned_values_json: '{}',
      created_by: 'J72',
      plan_senior_empid: 'J6',
      branch_id: null,
      department_id: null,
      status: 'pending',
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      promoted_record_id: null,
      chain_id: 101,
      created_at: now,
      updated_at: '2024-01-02T00:00:00.000Z',
    },
    {
      id: 102,
      company_id: 1,
      table_name: 'transactions_contract',
      form_name: null,
      config_name: null,
      module_key: null,
      payload_json: '{}',
      raw_values_json: '{}',
      cleaned_values_json: '{}',
      created_by: 'J72',
      plan_senior_empid: null,
      branch_id: null,
      department_id: null,
      status: 'promoted',
      review_notes: null,
      reviewed_by: 'J6',
      reviewed_at: '2024-01-03T00:00:00.000Z',
      promoted_record_id: 'PR-1',
      chain_id: 101,
      created_at: now,
      updated_at: '2024-01-03T00:00:00.000Z',
    },
    {
      id: 201,
      company_id: 1,
      table_name: 'transactions_contract',
      form_name: null,
      config_name: null,
      module_key: null,
      payload_json: '{}',
      raw_values_json: '{}',
      cleaned_values_json: '{}',
      created_by: 'J72',
      plan_senior_empid: 'J6',
      branch_id: null,
      department_id: null,
      status: 'pending',
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      promoted_record_id: null,
      chain_id: 201,
      created_at: now,
      updated_at: '2024-01-04T00:00:00.000Z',
    },
  ];
  const restore = mockQuery(async (sql, params = []) => {
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS `transaction_temporaries`')) {
      return [[], []];
    }
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS `transaction_temporary_review_history`')) {
      return [[], []];
    }
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      return [[{ COLUMN_NAME: 'chain_id' }, { COLUMN_NAME: 'is_pending' }]];
    }
    if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) {
      return [[{ CONSTRAINT_NAME: 'chk_temp_pending_reviewer' }]];
    }
    if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
      if (sql.includes('idx_temp_chain_pending')) {
        return [[{ INDEX_NAME: 'idx_temp_chain_pending' }]];
      }
      return [[{ INDEX_NAME: 'idx_temp_status_plan_senior' }]];
    }
    if (sql.includes('INFORMATION_SCHEMA.TRIGGERS')) {
      return [[{ TRIGGER_NAME: 'trg_temp_clear_reviewer' }]];
    }
    if (sql.startsWith('ALTER TABLE `transaction_temporaries`')) {
      return [[], []];
    }
    if (sql.startsWith('UPDATE `transaction_temporaries` SET chain_id = id WHERE chain_id IS NULL')) {
      return [[], []];
    }
    if (sql.includes('WITH filtered AS')) {
      if (sql.includes('plan_senior_empid = ?')) {
        const reviewer = params[params.length - 3];
        const pendingRows = temporaries.filter(
          (row) => row.plan_senior_empid === reviewer && row.status === 'pending',
        );
        const grouped = new Map();
        pendingRows.forEach((row) => {
          const key = row.chain_id || row.id;
          const existing = grouped.get(key);
          const existingDate = existing ? new Date(existing.updated_at) : null;
          const nextDate = new Date(row.updated_at);
          if (!existing || nextDate > existingDate) {
            grouped.set(key, row);
          }
        });
        return [Array.from(grouped.values())];
      }
      const creator = params[params.length - 3];
      const filteredRows = temporaries.filter((row) => row.created_by === creator);
      const grouped = new Map();
      filteredRows.forEach((row) => {
        const key = row.chain_id || row.id;
        const existing = grouped.get(key);
        const existingDate = existing ? new Date(existing.updated_at) : null;
        const nextDate = new Date(row.updated_at);
        if (!existing || nextDate > existingDate) {
          grouped.set(key, row);
        }
      });
      return [Array.from(grouped.values())];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  try {
    const reviewRows = await listTemporarySubmissions({
      scope: 'review',
      tableName: 'transactions_contract',
      empId: 'J6',
      companyId: 1,
      status: 'pending',
    });
    assert.equal(reviewRows.hasMore, false);
    assert.deepEqual(
      reviewRows.rows.map((row) => row.id).sort((a, b) => a - b),
      [101, 201],
    );

    const createdRows = await listTemporarySubmissions({
      scope: 'created',
      tableName: 'transactions_contract',
      empId: 'J72',
      companyId: 1,
      status: 'any',
    });
    assert.equal(createdRows.hasMore, false);
    assert.deepEqual(
      createdRows.rows.map((row) => row.id).sort((a, b) => a - b),
      [102, 201],
    );
  } finally {
    restore();
  }
});

test('promoteTemporarySubmission forwards chain with normalized metadata and clears reviewers', async () => {
  const temporaryRow = {
    id: 3,
    company_id: 1,
    chain_id: 1,
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
    { reviewerEmpId: 'EMP100', cleanedValues: { amount: 10 } },
    {
      connectionFactory: async () => conn,
      columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
      employmentSessionFetcher: async () => ({ senior_empid: 'EMP300' }),
      chainStatusUpdater: async (_c, chainId, payload) => chainUpdates.push({ chainId, payload }),
      notificationInserter: async (_c, payload) => notifications.push(payload),
      activityLogger: async () => {},
    },
  );

  assert.equal(result.forwardedTo, 'EMP300');
  assert.ok(chainUpdates.length > 0);
  assert.equal(chainUpdates[0].chainId, 1);
  assert.equal(chainUpdates[0].payload.clearReviewerAssignment, true);
  assert.equal(chainUpdates[0].payload.status, 'forwarded');
  assert.equal(chainUpdates[0].payload.pendingOnly, true);
  assert.ok(queries.some(({ sql }) => sql.includes('INSERT INTO `transaction_temporaries`')));
  const forwardInsert = queries.find(({ sql }) => sql.includes('INSERT INTO `transaction_temporaries`'));
  assert.ok(forwardInsert);
  const forwardParams = forwardInsert.params;
  assert.equal(forwardParams[8], 'EMP100'); // created_by
  assert.equal(forwardParams[9], 'EMP300'); // plan_senior_empid
  assert.equal(forwardParams[12], 1); // chain_id
  assert.equal(forwardParams[13], 'pending');
  const historyInsert = queries.find(({ sql }) =>
    sql.includes('INSERT INTO `transaction_temporary_review_history`'),
  );
  assert.ok(historyInsert);
  assert.equal(historyInsert.params[2], 'forwarded');
  assert.equal(historyInsert.params[4], 'EMP300');
  assert.ok(
    notifications.some(
      (payload) =>
        payload.recipientEmpId === 'EMP300' &&
        payload.message.includes('Temporary submission pending review'),
    ),
  );
  assert.ok(conn.released);
});

test('promoteTemporarySubmission forwards by falling back to its own id when chain_id is missing', async () => {
  const temporaryRow = {
    id: 25,
    company_id: 1,
    chain_id: null,
    table_name: 'transactions_test',
    form_name: null,
    config_name: null,
    module_key: null,
    payload_json: '{}',
    cleaned_values_json: '{}',
    raw_values_json: '{}',
    created_by: 'EMP200',
    plan_senior_empid: 'EMP100',
    branch_id: null,
    department_id: null,
    status: 'pending',
  };
  const chainUpdates = [];
  const { conn, queries } = createStubConnection({ temporaryRow });

  const runtimeDeps = {
    connectionFactory: async () => conn,
    columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
    employmentSessionFetcher: async (empid) =>
      empid === 'EMP100' ? { senior_empid: 'EMP500' } : {},
    chainStatusUpdater: async (_c, chainId, payload) =>
      chainUpdates.push({ chainId, payload }),
    notificationInserter: async () => {},
    activityLogger: async () => {},
  };

  const result = await promoteTemporarySubmission(
    25,
    { reviewerEmpId: 'EMP100', cleanedValues: { amount: 10 } },
    runtimeDeps,
  );
  assert.equal(result.forwardedTo, 'EMP500');
  assert.equal(chainUpdates[0]?.chainId, 25);
  assert.equal(chainUpdates[0]?.payload.status, 'forwarded');
  assert.ok(conn.released);
});

test('promoteTemporarySubmission forwards when reviewer has a senior reviewer', async () => {
  const temporaryRow = {
    id: 35,
    company_id: 1,
    chain_id: 35,
    table_name: 'transactions_test',
    form_name: null,
    config_name: null,
    module_key: null,
    payload_json: '{}',
    cleaned_values_json: '{}',
    raw_values_json: '{}',
    created_by: 'EMP200',
    plan_senior_empid: 'EMP100',
    branch_id: null,
    department_id: null,
    status: 'pending',
  };

  const chainUpdates = [];
  const { conn } = createStubConnection({ temporaryRow });
  const runtimeDeps = {
    connectionFactory: async () => conn,
    columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
    employmentSessionFetcher: async () => ({ senior_empid: 'EMP777' }),
    chainStatusUpdater: async (_c, chainId, payload) => chainUpdates.push({ chainId, payload }),
    notificationInserter: async () => {},
    activityLogger: async () => {},
  };

  const result = await promoteTemporarySubmission(
    35,
    { reviewerEmpId: 'EMP100', cleanedValues: { amount: 10 } },
    runtimeDeps,
  );

  assert.equal(result.forwardedTo, 'EMP777');
  assert.equal(chainUpdates[0]?.chainId, 35);
  assert.equal(chainUpdates[0]?.payload.status, 'forwarded');
});

test('promoteTemporarySubmission promotes when reviewer only has plan senior', async () => {
  const temporaryRow = {
    id: 36,
    company_id: 1,
    chain_id: 36,
    table_name: 'transactions_test',
    form_name: null,
    config_name: null,
    module_key: null,
    payload_json: '{}',
    cleaned_values_json: '{}',
    raw_values_json: '{}',
    created_by: 'EMP200',
    plan_senior_empid: 'EMP100',
    branch_id: null,
    department_id: null,
    status: 'pending',
  };

  const chainUpdates = [];
  const notifications = [];
  const { conn } = createStubConnection({ temporaryRow, chainIds: [36] });

  const runtimeDeps = {
    connectionFactory: async () => conn,
    columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
    tableInserter: async () => ({ id: 'R1' }),
    employmentSessionFetcher: async () => ({
      senior_empid: null,
      senior_plan_empid: 'PLAN300',
    }),
    chainStatusUpdater: async (_c, chainId, payload) =>
      chainUpdates.push({ chainId, payload }),
    notificationInserter: async (_c, payload) => notifications.push(payload),
    activityLogger: async () => {},
  };

  const result = await promoteTemporarySubmission(
    36,
    { reviewerEmpId: 'EMP100', cleanedValues: { amount: 10 } },
    runtimeDeps,
  );

  assert.equal(result.promotedRecordId, 'R1');
  assert.ok(chainUpdates.some(({ payload }) => payload.status === 'promoted'));
  assert.ok(notifications.every((n) => n.recipientEmpId !== 'PLAN300'));
  assert.equal(conn.released, true);
});

test('promoteTemporarySubmission promotes chain and records promotedRecordId', async () => {
  const temporaryRow = {
    id: 7,
    company_id: 1,
    chain_id: 6,
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
      chainStatusUpdater: async (_c, chainId, payload) => chainUpdates.push({ chainId, payload }),
      notificationInserter: async (_c, payload) => notifications.push(payload),
      activityLogger: async () => {},
    },
  );

  assert.equal(result.promotedRecordId, '909');
  assert.equal(chainUpdates.length, 2);
  assert.equal(chainUpdates[0].chainId, 6);
  assert.equal(chainUpdates[0].payload.promotedRecordId, '909');
  assert.equal(chainUpdates[0].payload.clearReviewerAssignment, true);
  assert.equal(chainUpdates[0].payload.pendingOnly, true);
  assert.equal(chainUpdates[0].payload.temporaryOnly, true);
  assert.equal(chainUpdates[1].payload.temporaryOnly, false);
  assert.equal(chainUpdates[1].payload.pendingOnly, true);
  const historyInsert = queries.find(({ sql }) =>
    sql.includes('INSERT INTO `transaction_temporary_review_history`'),
  );
  assert.ok(historyInsert);
  assert.equal(historyInsert.params[2], 'promoted');
  assert.equal(historyInsert.params[5], '909');
  assert.ok(conn.released);
});

test('promoteTemporarySubmission falls back to chain update when temporary-only update has no effect', async () => {
  const temporaryRow = {
    id: 17,
    company_id: 1,
    chain_id: 17,
    table_name: 'transactions_test',
    form_name: null,
    config_name: null,
    module_key: null,
    payload_json: '{}',
    cleaned_values_json: '{}',
    raw_values_json: '{}',
    created_by: 'EMP150',
    plan_senior_empid: 'EMP777',
    branch_id: null,
    department_id: null,
    status: 'pending',
  };

  const chainUpdates = [];
  const { conn } = createStubConnection({ temporaryRow, chainIds: [17] });
  const runtimeDeps = {
    connectionFactory: async () => conn,
    columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
    tableInserter: async () => ({ id: 321 }),
    chainStatusUpdater: async (_c, chainId, payload) => {
      chainUpdates.push({ chainId, payload });
      return chainUpdates.length === 1 ? 0 : 1;
    },
    notificationInserter: async () => {},
    activityLogger: async () => {},
  };

  const result = await promoteTemporarySubmission(
    17,
    { reviewerEmpId: 'EMP777', cleanedValues: { amount: 42 } },
    runtimeDeps,
  );

  assert.equal(result.promotedRecordId, '321');
  assert.equal(chainUpdates.length, 2);
  assert.equal(chainUpdates[0].payload.temporaryOnly, true);
  assert.equal(chainUpdates[1].payload.temporaryOnly, false);
  assert.equal(chainUpdates[1].payload.pendingOnly, true);
  assert.equal(conn.released, true);
});

test('promoteTemporarySubmission prevents concurrent promotions and respects row locks', async () => {
  let status = 'pending';
  const temporaryRow = {
    id: 11,
    company_id: 1,
    chain_id: 11,
    table_name: 'transactions_test',
    form_name: null,
    config_name: null,
    module_key: null,
    payload_json: '{}',
    cleaned_values_json: '{}',
    raw_values_json: '{}',
    created_by: 'EMP150',
    plan_senior_empid: 'EMP500',
    branch_id: null,
    department_id: null,
    status,
  };

  const queries = [];
  const conn = {
    released: false,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) return [[], []];
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return [[], []];
      if (sql.startsWith('SELECT * FROM `transaction_temporaries` WHERE id = ?')) {
        return [[{ ...temporaryRow, status }]];
      }
      if (sql.includes("WHERE chain_id = ? AND status = 'pending'")) {
        return [[]];
      }
      if (sql.includes('WHERE chain_id = ?')) {
        return [[]];
      }
      if (sql.startsWith('SELECT DISTINCT created_by FROM `transaction_temporaries` WHERE chain_id = ?')) {
        return [[{ created_by: temporaryRow.created_by }]];
      }
      if (sql.startsWith('SET @skip_triggers')) return [[], []];
      if (sql.startsWith('UPDATE `transaction_temporaries`')) {
        status = params[0] || status;
        return [[{ affectedRows: 1 }]];
      }
      if (sql.startsWith('INSERT INTO `transaction_temporary_review_history`')) {
        return [[{ insertId: 999 }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      this.released = true;
    },
  };

  const runtimeDeps = {
    connectionFactory: async () => conn,
    columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
    tableInserter: async () => ({ id: 777 }),
    notificationInserter: async () => {},
    activityLogger: async () => {},
  };

  await promoteTemporarySubmission(
    11,
    { reviewerEmpId: 'EMP500', cleanedValues: { amount: 50 } },
    runtimeDeps,
  );

  status = 'promoted';

  await assert.rejects(
    () =>
      promoteTemporarySubmission(
        11,
        { reviewerEmpId: 'EMP500', cleanedValues: { amount: 50 } },
        runtimeDeps,
      ),
    (err) => err && err.status === 409,
  );

  assert.ok(queries.some(({ sql }) => sql.includes('FOR UPDATE')));
});

test('promoteTemporarySubmission blocks when another pending temporary exists in the chain', async () => {
  const temporaryRow = {
    id: 15,
    company_id: 1,
    chain_id: 15,
    table_name: 'transactions_test',
    form_name: null,
    config_name: null,
    module_key: null,
    payload_json: '{}',
    cleaned_values_json: '{}',
    raw_values_json: '{}',
    created_by: 'EMP150',
    plan_senior_empid: 'EMP200',
    branch_id: null,
    department_id: null,
    status: 'pending',
  };

  const queries = [];
  const conn = {
    released: false,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) return [[], []];
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return [[], []];
      if (sql.startsWith('SELECT * FROM `transaction_temporaries` WHERE id = ?')) {
        return [[temporaryRow]];
      }
      if (sql.includes('WHERE chain_id = ?')) {
        return [[{ id: 42 }]];
      }
      if (sql.startsWith('SET @skip_triggers')) return [[], []];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      this.released = true;
    },
  };

  const runtimeDeps = {
    connectionFactory: async () => conn,
    columnLister: async () => [{ name: 'amount', type: 'int', maxLength: null }],
    tableInserter: async () => ({ id: 555 }),
    notificationInserter: async () => {},
    activityLogger: async () => {},
  };

  await assert.rejects(
    () =>
      promoteTemporarySubmission(
        15,
        { reviewerEmpId: 'EMP200', cleanedValues: { amount: 99 } },
        runtimeDeps,
      ),
    (err) => err && err.status === 409,
  );

  assert.ok(queries.some(({ sql }) => sql.includes('status = \'pending\'')));
  assert.ok(conn.released);
});

test('getTemporaryChainHistory returns chainId and history rows', async () => {
  const now = '2024-02-01T00:00:00.000Z';
  const chainRows = [
    {
      id: 501,
      chain_id: 501,
      status: 'pending',
      plan_senior_empid: 'J6',
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
      promoted_record_id: null,
      created_by: 'J72',
      created_at: now,
      updated_at: now,
    },
    {
      id: 502,
      chain_id: 501,
      status: 'promoted',
      plan_senior_empid: null,
      reviewed_by: 'J6',
      reviewed_at: '2024-02-02T00:00:00.000Z',
      review_notes: 'done',
      promoted_record_id: 'PR-2',
      created_by: 'J6',
      created_at: now,
      updated_at: '2024-02-02T00:00:00.000Z',
    },
  ];
  const reviewHistory = [
    {
      id: 701,
      temporary_id: 501,
      chain_id: 501,
      action: 'promoted',
      reviewer_empid: 'J6',
      forwarded_to_empid: null,
      promoted_record_id: 'PR-2',
      notes: 'done',
      created_at: '2024-02-02T00:00:00.000Z',
    },
  ];

  const queries = [];
  const conn = {
    released: false,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) return [[], []];
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
        return [[{ COLUMN_NAME: 'chain_id' }, { COLUMN_NAME: 'is_pending' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
        return [[{ INDEX_NAME: 'idx_temp_chain_pending' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) {
        return [[{ CONSTRAINT_NAME: 'chk_temp_pending_reviewer' }]];
      }
      if (sql.includes('INFORMATION_SCHEMA.TRIGGERS')) {
        return [[{ TRIGGER_NAME: 'trg_temp_clear_reviewer' }]];
      }
      if (sql.startsWith('ALTER TABLE `transaction_temporaries`')) return [[], []];
      if (sql.startsWith('UPDATE `transaction_temporaries` SET chain_id = id WHERE chain_id IS NULL')) {
        return [[], []];
      }
      if (sql.startsWith('ALTER TABLE `transaction_temporary_review_history`')) return [[], []];
      if (
        sql.startsWith(
          'UPDATE `transaction_temporary_review_history` SET chain_id = temporary_id WHERE chain_id IS NULL',
        )
      ) {
        return [[], []];
      }
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS `transaction_temporary_review_history`')) {
        return [[], []];
      }
      if (sql.startsWith('SELECT id, chain_id AS chainId') && sql.includes('WHERE id = ?')) {
        return [[chainRows[0]]];
      }
      if (sql.startsWith('SELECT id, chain_id AS chainId')) {
        return [chainRows];
      }
      if (sql.startsWith('SELECT id, temporary_id, chain_id')) {
        return [reviewHistory];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      this.released = true;
    },
  };

  const originalGetConnection = db.pool.getConnection;
  db.pool.getConnection = async () => conn;

  try {
    const result = await getTemporaryChainHistory(501);
    assert.equal(result.chainId, 501);
    assert.deepEqual(
      result.chain.map((row) => row.id),
      [501, 502],
    );
    assert.equal(result.reviewHistory.length, 1);
    assert.ok(!queries.some(({ sql }) => sql.includes('chain_uuid')));
    assert.ok(conn.released);
  } finally {
    db.pool.getConnection = originalGetConnection;
  }
});

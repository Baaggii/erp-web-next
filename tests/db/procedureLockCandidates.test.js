import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

const STRICT_SESSION_VAR_QUERY =
  'SELECT @__report_lock_candidates AS strict, @_report_lock_candidates AS secondary, @report_lock_candidates AS legacy';

test('getProcedureLockCandidates ignores primitive columns and keeps structured hints', async () => {
  const queryLog = [];
  let released = false;

  const mockConn = {
    async query(sql, params) {
      queryLog.push([sql, params]);
      if (/^SET @/.test(sql)) {
        return [[], []];
      }
      if (sql.startsWith('CALL ')) {
        return [
          [
            [
              {
                amount: 150,
                sales_orders: [41, { record_id: '42', label: 'SO 42' }],
                lockHint: { table: 'payments', record_id: 55, label: 'Payment 55' },
              },
            ],
          ],
          [],
        ];
      }
      if (sql === STRICT_SESSION_VAR_QUERY) {
        return [
          [
            {
              strict: JSON.stringify([{ table: 'invoices', record_id: 99 }]),
              secondary: null,
              legacy: null,
            },
          ],
          [],
        ];
      }
      if (sql.includes('FROM report_transaction_locks')) {
        return [[], []];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {
      released = true;
    },
  };

  const originalGetConnection = db.pool.getConnection;
  const originalQuery = db.pool.query;
  const restoreGetConnection = () => {
    if (originalGetConnection === undefined) {
      delete db.pool.getConnection;
    } else {
      db.pool.getConnection = originalGetConnection;
    }
  };
  const restoreQuery = () => {
    db.pool.query = originalQuery;
  };

  db.pool.getConnection = async () => mockConn;
  db.pool.query = async () => {
    const err = new Error('no such table');
    err.code = 'ER_NO_SUCH_TABLE';
    throw err;
  };

  try {
    const candidates = await db.getProcedureLockCandidates('sp_report');

    const keys = candidates.map((c) => `${c.tableName}#${c.recordId}`).sort();
    assert.deepEqual(keys, ['invoices#99', 'payments#55', 'sales_orders#41', 'sales_orders#42']);
    assert.ok(candidates.every((c) => c.tableName !== 'amount'));

    const payments = candidates.find((c) => c.tableName === 'payments');
    assert.equal(payments?.label, 'Payment 55');

    assert.ok(released, 'connection should be released');
    assert.ok(
      queryLog.some(([sql]) => sql.startsWith('CALL sp_report')),
      'stored procedure should be invoked',
    );
  } finally {
    restoreGetConnection();
    restoreQuery();
  }
});

test('getProcedureLockCandidates parses buffer encoded JSON arrays', async () => {
  const queryLog = [];
  let released = false;

  const mockConn = {
    async query(sql, params) {
      queryLog.push([sql, params]);
      if (/^SET @/.test(sql)) {
        return [[], []];
      }
      if (sql.startsWith('CALL ')) {
        return [
          [
            [
              {
                __lock_candidates: Buffer.from(
                  JSON.stringify([
                    { table: 'transactions_contract', record_id: 123 },
                    { table: 'code_unit', record_id: 'A-45' },
                  ]),
                  'utf8',
                ),
              },
            ],
          ],
          [],
        ];
      }
      if (sql === STRICT_SESSION_VAR_QUERY) {
        return [[{ strict: null, secondary: null, legacy: null }], []];
      }
      if (sql.includes('FROM report_transaction_locks')) {
        return [[], []];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {
      released = true;
    },
  };

  const originalGetConnection = db.pool.getConnection;
  const originalQuery = db.pool.query;
  const restoreGetConnection = () => {
    if (originalGetConnection === undefined) {
      delete db.pool.getConnection;
    } else {
      db.pool.getConnection = originalGetConnection;
    }
  };
  const restoreQuery = () => {
    db.pool.query = originalQuery;
  };

  db.pool.getConnection = async () => mockConn;
  db.pool.query = async () => {
    const err = new Error('no such table');
    err.code = 'ER_NO_SUCH_TABLE';
    throw err;
  };

  try {
    const candidates = await db.getProcedureLockCandidates('sp_buffer_report');
    const keys = candidates.map((c) => `${c.tableName}#${c.recordId}`).sort();
    assert.deepEqual(keys, ['code_unit#A-45', 'transactions_contract#123']);
    assert.ok(released, 'connection should be released');
    assert.ok(
      queryLog.some(([sql]) => sql.startsWith('CALL sp_buffer_report')),
      'stored procedure should be invoked',
    );
  } finally {
    restoreGetConnection();
    restoreQuery();
  }
});

test('getProcedureLockCandidates preserves table context for JSON strings', async () => {
  const queryLog = [];
  let released = false;

  const mockConn = {
    async query(sql, params) {
      queryLog.push([sql, params]);
      if (/^SET @/.test(sql)) {
        return [[], []];
      }
      if (sql.startsWith('CALL ')) {
        return [
          [
            [
              {
                sales_orders: ' [41,42] ',
              },
            ],
          ],
          [],
        ];
      }
      if (sql === STRICT_SESSION_VAR_QUERY) {
        return [[{ strict: null, secondary: null, legacy: null }], []];
      }
      if (sql.includes('FROM report_transaction_locks')) {
        return [[], []];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {
      released = true;
    },
  };

  const originalGetConnection = db.pool.getConnection;
  const originalQuery = db.pool.query;
  const restoreGetConnection = () => {
    if (originalGetConnection === undefined) {
      delete db.pool.getConnection;
    } else {
      db.pool.getConnection = originalGetConnection;
    }
  };
  const restoreQuery = () => {
    db.pool.query = originalQuery;
  };

  db.pool.getConnection = async () => mockConn;
  db.pool.query = async () => {
    const err = new Error('no such table');
    err.code = 'ER_NO_SUCH_TABLE';
    throw err;
  };

  try {
    const candidates = await db.getProcedureLockCandidates('sp_json_report');
    const keys = candidates.map((c) => `${c.tableName}#${c.recordId}`).sort();
    assert.deepEqual(keys, ['sales_orders#41', 'sales_orders#42']);
    assert.ok(released, 'connection should be released');
    assert.ok(
      queryLog.some(([sql]) => sql.startsWith('CALL sp_json_report')),
      'stored procedure should be invoked',
    );
  } finally {
    restoreGetConnection();
    restoreQuery();
  }
});

test('getProcedureLockCandidates recovers snapshots using partial unique indexes', async () => {
  const queryLog = [];
  let released = false;

  const mockConn = {
    async query(sql, params) {
      if (/^SET @/.test(sql)) {
        return [[], []];
      }
      if (sql.startsWith('CALL ')) {
        return [
          [
            [
              {
                lock_table: 'tbl_contracter',
                lock_record_id: 'W10',
                label: 'Contracter W10',
              },
            ],
          ],
          [],
        ];
      }
      if (sql === STRICT_SESSION_VAR_QUERY) {
        return [[{ strict: null, secondary: null, legacy: null }], []];
      }
      if (sql.includes('FROM report_transaction_locks')) {
        return [[], []];
      }
      throw new Error(`Unexpected connection query: ${sql}`);
    },
    release() {
      released = true;
    },
  };

  const originalGetConnection = db.pool.getConnection;
  const originalQuery = db.pool.query;

  const restoreGetConnection = () => {
    if (originalGetConnection === undefined) {
      delete db.pool.getConnection;
    } else {
      db.pool.getConnection = originalGetConnection;
    }
  };
  const restoreQuery = () => {
    db.pool.query = originalQuery;
  };

  db.pool.getConnection = async () => mockConn;
  db.pool.query = async (sql, params = []) => {
    queryLog.push([sql, params]);
    if (sql.includes('FROM information_schema.COLUMNS')) {
      const table = params?.[0];
      if (table === 'tbl_contracter') {
        return [
          [
            { COLUMN_NAME: 'id' },
            { COLUMN_NAME: 'manuf_id' },
            { COLUMN_NAME: 'company_id' },
            { COLUMN_NAME: 'manuf_rd' },
            { COLUMN_NAME: 'manuf_phone' },
            { COLUMN_NAME: 'deleted_at' },
          ],
          [],
        ];
      }
      return [[{ COLUMN_NAME: 'id' }], []];
    }
    if (
      sql.includes('FROM information_schema.STATISTICS') &&
      sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }], []];
    }
    if (
      sql.includes('FROM information_schema.STATISTICS') &&
      sql.includes('NON_UNIQUE = 0')
    ) {
      const table = params?.[0];
      if (table === 'tbl_contracter') {
        return [
          [
            { INDEX_NAME: 'PRIMARY', COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 },
            {
              INDEX_NAME: 'uniq_manuf_id_manuf_rd_manuf_phone',
              COLUMN_NAME: 'manuf_id',
              SEQ_IN_INDEX: 1,
            },
            {
              INDEX_NAME: 'uniq_manuf_id_manuf_rd_manuf_phone',
              COLUMN_NAME: 'manuf_rd',
              SEQ_IN_INDEX: 2,
            },
            {
              INDEX_NAME: 'uniq_manuf_id_manuf_rd_manuf_phone',
              COLUMN_NAME: 'manuf_phone',
              SEQ_IN_INDEX: 3,
            },
          ],
          [],
        ];
      }
      return [[], []];
    }
    if (sql.includes('FROM tenant_tables')) {
      return [[], []];
    }
    if (/SELECT \* FROM \?\? WHERE/.test(sql) && sql.includes('LIMIT 1')) {
      return [[], []];
    }
    if (/SELECT \* FROM \?\? WHERE/.test(sql) && sql.includes('LIMIT 2')) {
      return [
        [
          {
            id: 5,
            manuf_id: 'W10',
            company_id: 1,
            manuf_rd: 'Alpha Manufacturing',
            manuf_phone: '77110022',
            deleted_at: null,
          },
        ],
        [],
      ];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };

  try {
    const candidates = await db.getProcedureLockCandidates(
      'sp_partial_unique',
      [],
      [],
      { companyId: 1 },
    );

    const contracter = candidates.find(
      (c) => c.tableName === 'tbl_contracter' && c.recordId === 'W10',
    );
    assert.ok(contracter, 'should include tbl_contracter candidate');
    assert.ok(contracter.snapshot, 'snapshot should be populated from fallback');
    assert.equal(contracter.snapshot?.manuf_id, 'W10');
    assert.deepEqual(
      new Set(contracter.snapshotColumns || []),
      new Set(['id', 'manuf_id', 'company_id', 'manuf_rd', 'manuf_phone', 'deleted_at']),
    );
    assert.ok(released, 'connection should be released');
    assert.ok(
      queryLog.some(([sql]) => /LIMIT 2/.test(sql)),
      'should query using fallback lookup',
    );
  } finally {
    restoreGetConnection();
    restoreQuery();
  }
});

test('getProcedureLockCandidates splits repeated table strings into distinct candidates', async () => {
  const queryLog = [];
  let released = false;

  const mockConn = {
    async query(sql, params) {
      queryLog.push([sql, params]);
      if (/^SET @/.test(sql)) {
        return [[], []];
      }
      if (sql.startsWith('CALL ')) {
        return [
          [
            [
              'transactions_sales#41, transactions_sales#42',
              'transactions_sales#41 transactions_sales#42',
            ],
          ],
          [],
        ];
      }
      if (sql === STRICT_SESSION_VAR_QUERY) {
        return [[{ strict: null, secondary: null, legacy: null }], []];
      }
      if (sql.includes('FROM report_transaction_locks')) {
        return [[], []];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {
      released = true;
    },
  };

  const originalGetConnection = db.pool.getConnection;
  const originalQuery = db.pool.query;
  const restoreGetConnection = () => {
    if (originalGetConnection === undefined) {
      delete db.pool.getConnection;
    } else {
      db.pool.getConnection = originalGetConnection;
    }
  };
  const restoreQuery = () => {
    db.pool.query = originalQuery;
  };

  db.pool.getConnection = async () => mockConn;
  db.pool.query = async () => {
    const err = new Error('no such table');
    err.code = 'ER_NO_SUCH_TABLE';
    throw err;
  };

  try {
    const candidates = await db.getProcedureLockCandidates('sp_multi_string_report');
    const keys = candidates.map((c) => `${c.tableName}#${c.recordId}`).sort();
    assert.deepEqual(keys, ['transactions_sales#41', 'transactions_sales#42']);
    assert.ok(released, 'connection should be released');
    assert.ok(
      queryLog.some(([sql]) => sql.startsWith('CALL sp_multi_string_report')),
      'stored procedure should be invoked',
    );
  } finally {
    restoreGetConnection();
    restoreQuery();
  }
});

test('getProcedureLockCandidates parses dynrep lock bundle JSON with multiple tables', async () => {
  const queryLog = [];
  let released = false;

  const lockBundleRows = [
    [
      {
        transaction_id: 1,
        lock_bundle: JSON.stringify({
          transactions_test: [
            {
              lock_table: 'transactions_test',
              lock_record_id: 1,
              label: 'Transaction 1',
              context: { company_id: 1, request_id: 9001 },
            },
          ],
          transactions_test_detail: {
            lock_table: 'transactions_test_detail',
            lock_record_ids: [1001, 1002],
            records: [
              {
                lock_table: 'transactions_test_detail',
                lock_record_id: 1001,
                label: 'Detail 1 (SKU-001)',
                context: { sku: 'SKU-001', line_no: 1 },
              },
              {
                lock_table: 'transactions_test_detail',
                lock_record_id: 1002,
                label: 'Detail 2 (SKU-002)',
                context: { sku: 'SKU-002', line_no: 2 },
              },
            ],
            label: 'Transaction 1 details',
          },
        }),
      },
      {
        transaction_id: 2,
        lock_bundle: JSON.stringify({
          transactions_test: [
            {
              lock_table: 'transactions_test',
              lock_record_id: 2,
              label: 'Transaction 2',
              context: { company_id: 1, request_id: 9002 },
            },
          ],
          transactions_test_detail: {
            lock_table: 'transactions_test_detail',
            lock_record_ids: [1003],
            records: [
              {
                lock_table: 'transactions_test_detail',
                lock_record_id: 1003,
                label: 'Detail 1 (SKU-003)',
                context: { sku: 'SKU-003', line_no: 1 },
              },
            ],
            label: 'Transaction 2 details',
          },
        }),
      },
    ],
  ];

  const strictCandidates = JSON.stringify([
    { table: 'transactions_test', record_id: 1, label: 'Transaction 1' },
    { table: 'transactions_test', record_id: 2, label: 'Transaction 2' },
    { table: 'transactions_test_detail', record_id: 1001, label: 'Detail 1' },
    { table: 'transactions_test_detail', record_id: 1002, label: 'Detail 2' },
    { table: 'transactions_test_detail', record_id: 1003, label: 'Detail 3' },
  ]);

  const mockConn = {
    async query(sql, params) {
      queryLog.push([sql, params]);
      if (/^SET @/.test(sql)) {
        return [[], []];
      }
      if (sql.startsWith('CALL ')) {
        return [lockBundleRows, []];
      }
      if (sql === STRICT_SESSION_VAR_QUERY) {
        return [[{ strict: strictCandidates, secondary: null, legacy: null }], []];
      }
      if (sql.includes('FROM report_transaction_locks')) {
        const tableName = params?.[0];
        if (tableName === 'transactions_test') {
          return [
            [
              {
                table_name: 'transactions_test',
                record_id: '1',
                status: 'locked',
                status_changed_by: 'alice',
                status_changed_at: '2024-10-01T00:00:00.000Z',
              },
            ],
            [],
          ];
        }
        if (tableName === 'transactions_test_detail') {
          return [
            [
              {
                table_name: 'transactions_test_detail',
                record_id: '1002',
                status: 'pending',
                status_changed_by: 'bob',
                status_changed_at: '2024-10-02T00:00:00.000Z',
              },
            ],
            [],
          ];
        }
        return [[], []];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {
      released = true;
    },
  };

  const originalGetConnection = db.pool.getConnection;
  const originalQuery = db.pool.query;

  const restoreGetConnection = () => {
    if (originalGetConnection === undefined) {
      delete db.pool.getConnection;
    } else {
      db.pool.getConnection = originalGetConnection;
    }
  };
  const restoreQuery = () => {
    db.pool.query = originalQuery;
  };

  db.pool.getConnection = async () => mockConn;
  db.pool.query = async () => {
    const err = new Error('no such table');
    err.code = 'ER_NO_SUCH_TABLE';
    throw err;
  };

  try {
    const candidates = await db.getProcedureLockCandidates(
      'dynrep_1_sp_transactions_test_report',
      [1],
      [],
      { companyId: 1 },
    );

    const keys = candidates.map((c) => `${c.tableName}#${c.recordId}`).sort();
    assert.deepEqual(keys, [
      'transactions_test#1',
      'transactions_test#2',
      'transactions_test_detail#1001',
      'transactions_test_detail#1002',
      'transactions_test_detail#1003',
    ]);

    const lockedTxn = candidates.find((c) => c.tableName === 'transactions_test' && c.recordId === '1');
    assert.ok(lockedTxn?.locked, 'transaction 1 should be marked locked');
    assert.equal(lockedTxn?.lockStatus, 'locked');
    assert.equal(lockedTxn?.lockedBy, 'alice');

    const pendingDetail = candidates.find((c) => c.tableName === 'transactions_test_detail' && c.recordId === '1002');
    assert.equal(pendingDetail?.lockStatus, 'pending');
    assert.equal(pendingDetail?.lockedBy, 'bob');
    assert.match(pendingDetail?.label || '', /Detail 2/);

    assert.ok(released, 'connection should be released');
    assert.ok(
      queryLog.some(([sql]) => sql.startsWith('CALL dynrep_1_sp_transactions_test_report')),
      'stored procedure should be invoked',
    );
  } finally {
    restoreGetConnection();
    restoreQuery();
  }
});

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

test('getProcedureLockCandidates attaches metadata for multiple lock candidates', async () => {
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
                lock_table: 'reports',
                lock_record_id: 7,
                label: 'Report 7',
              },
              {
                lock_table: 'reports',
                lock_record_ids: [8, '9'],
                description: 'Queued reports',
              },
            ],
            [
              {
                approvals: [
                  {
                    table: 'requests',
                    record_id: 'req-1',
                    label: 'Approval 1',
                  },
                ],
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
              strict: JSON.stringify([
                {
                  table: 'reports',
                  record_id: '10',
                  label: 'Report 10',
                },
              ]),
              secondary: null,
              legacy: null,
            },
          ],
          [],
        ];
      }
      if (sql.includes('FROM report_transaction_locks')) {
        const tableName = params?.[0];
        if (tableName === 'reports') {
          return [
            [
              {
                table_name: 'reports',
                record_id: '7',
                status: 'locked',
                finalized_by: 'Analyst A',
                finalized_at: '2024-02-01T00:00:00.000Z',
              },
              {
                table_name: 'reports',
                record_id: '8',
                status: 'pending',
                status_changed_by: 'Analyst B',
                status_changed_at: '2024-02-02T00:00:00.000Z',
              },
            ],
            [],
          ];
        }
        if (tableName === 'requests') {
          return [
            [
              {
                table_name: 'requests',
                record_id: 'req-1',
                status: 'locked',
                status_changed_by: 'Manager M',
                status_changed_at: '2024-02-03T00:00:00.000Z',
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
      'sp_multiple_lock_test',
      [],
      [],
      { companyId: 23 },
    );

    const keys = candidates.map((c) => c.key).sort();
    assert.deepEqual(keys, [
      'reports#10',
      'reports#7',
      'reports#8',
      'reports#9',
      'requests#req-1',
    ]);

    const report7 = candidates.find((c) => c.key === 'reports#7');
    assert.equal(report7?.locked, true);
    assert.equal(report7?.lockStatus, 'locked');
    assert.equal(report7?.lockedBy, 'Analyst A');
    assert.equal(report7?.lockedAt, '2024-02-01T00:00:00.000Z');

    const report8 = candidates.find((c) => c.key === 'reports#8');
    assert.equal(report8?.locked, true);
    assert.equal(report8?.lockStatus, 'pending');
    assert.equal(report8?.lockedBy, 'Analyst B');
    assert.equal(report8?.lockedAt, '2024-02-02T00:00:00.000Z');

    const report9 = candidates.find((c) => c.key === 'reports#9');
    assert.equal(report9?.locked, false);
    assert.equal(report9?.lockStatus, null);
    assert.equal(report9?.lockedBy, null);

    const request = candidates.find((c) => c.key === 'requests#req-1');
    assert.equal(request?.locked, true);
    assert.equal(request?.lockStatus, 'locked');
    assert.equal(request?.lockedBy, 'Manager M');
    assert.equal(request?.lockedAt, '2024-02-03T00:00:00.000Z');

    assert.ok(released, 'connection should be released');

    const lockQueries = queryLog.filter(([sql]) =>
      sql.includes('FROM report_transaction_locks'),
    );
    assert.equal(lockQueries.length, 2);

    const [reportsParams, requestsParams] = lockQueries.map(([, params]) => params);
    assert.equal(reportsParams[0], 'reports');
    assert.equal(reportsParams[1], 23);
    assert.deepEqual(
      new Set(reportsParams.slice(2, reportsParams.length - 2)),
      new Set(['7', '8', '9', '10']),
    );
    assert.deepEqual(reportsParams.slice(-2), ['locked', 'pending']);

    assert.equal(requestsParams[0], 'requests');
    assert.equal(requestsParams[1], 23);
    assert.deepEqual(requestsParams.slice(2, requestsParams.length - 2), ['req-1']);
    assert.deepEqual(requestsParams.slice(-2), ['locked', 'pending']);
  } finally {
    restoreGetConnection();
    restoreQuery();
  }
});

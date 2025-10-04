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

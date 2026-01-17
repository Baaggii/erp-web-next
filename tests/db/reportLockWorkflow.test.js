import test from 'node:test';
import assert from 'node:assert/strict';

test('lockTransactionsForReport keeps locks pending until activation', async () => {
  process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test-admin';
  process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test-pass';
  process.env.DB_USER = process.env.DB_USER || 'test-user';
  process.env.DB_PASS = process.env.DB_PASS || 'test-pass';
  process.env.DB_HOST = process.env.DB_HOST || 'localhost';
  process.env.DB_NAME = process.env.DB_NAME || 'test-db';

  const {
    lockTransactionsForReport,
    activateReportTransactionLocks,
  } = await import('../../db/index.js');

  const queries = [];
  const mockConn = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }, []];
    },
  };

  await lockTransactionsForReport(
    {
      companyId: 1,
      requestId: 'REQ-1',
      createdBy: 'EMP-1',
      transactions: [
        { tableName: 'transactions_contract', recordId: '10' },
        { table: 'transactions_contract', id: '11' },
      ],
    },
    mockConn,
  );

  const insert = queries.find((entry) =>
    entry.sql.includes('INSERT INTO report_transaction_locks'),
  );
  assert.ok(insert, 'expected insert into report_transaction_locks');
  const statusValues = insert.params.filter((_, idx) => (idx + 1) % 6 === 5);
  assert.deepEqual(statusValues, ['pending', 'pending']);

  await activateReportTransactionLocks(
    { requestId: 'REQ-1', finalizedBy: 'MANAGER-1' },
    mockConn,
  );

  const update = queries.find((entry) =>
    entry.sql.startsWith('UPDATE report_transaction_locks'),
  );
  assert.ok(update, 'expected update to activate report_transaction_locks');
  assert.equal(update.params[0], 'locked');
  assert.equal(update.params[1], 'MANAGER-1');
  assert.equal(update.params[2], 'REQ-1');
});

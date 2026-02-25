import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test_admin';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test_admin_pass';

const { closeFiscalPeriod } = await import('../../api-server/services/periodControlService.js');

function createMockConnection({ periodClosed = 0, balanceRows = [] } = {}) {
  const calls = [];
  const conn = {
    async beginTransaction() { calls.push({ type: 'begin' }); },
    async commit() { calls.push({ type: 'commit' }); },
    async rollback() { calls.push({ type: 'rollback' }); },
    release() { calls.push({ type: 'release' }); },
    async query(sql, params = []) {
      calls.push({ type: 'query', sql, params });
      if (sql.includes('FROM fin_period_control') && sql.includes('WHERE company_id = ? AND fiscal_year = ?')) {
        return [[{ company_id: 1, fiscal_year: 2025, period_from: '2025-01-01', period_to: '2025-12-31', is_closed: periodClosed, closed_at: null, closed_by: null }]];
      }
      if (sql.includes('FROM fin_journal_line l')) return [balanceRows];
      if (sql.includes('INSERT INTO fin_journal_header')) return [{ insertId: 555 }];
      return [[{ affectedRows: 1 }]];
    },
  };
  return { conn, calls };
}

function asPool(conn) { return { async getConnection() { return conn; } }; }

test('closeFiscalPeriod closes an open period and creates opening journal', async () => {
  const { conn, calls } = createMockConnection({ balanceRows: [{ account_code: '1001', dimension_type_code: '', dimension_id: '', dr_cr: 'D', amount: 100 }] });
  const result = await closeFiscalPeriod({ companyId: 1, fiscalYear: 2025, userId: 'tester', reportProcedures: ['dynrep_1_sp_trial_balance_expandable'], dbPool: asPool(conn) });
  assert.equal(result.ok, true);
  assert.equal(result.nextFiscalYear, 2026);
  assert.equal(result.openingJournalId, 555);
  assert.ok(calls.some((c) => c.type === 'query' && c.sql.includes('CALL `dynrep_1_sp_trial_balance_expandable`(?, ?, ?, ?)')));
});

test('closeFiscalPeriod rejects already closed periods', async () => {
  const { conn } = createMockConnection({ periodClosed: 1 });
  await assert.rejects(() => closeFiscalPeriod({ companyId: 1, fiscalYear: 2025, userId: 'tester', reportProcedures: ['dynrep_1_sp_trial_balance_expandable'], dbPool: asPool(conn) }), /already closed/i);
});


test('closeFiscalPeriod retries 4-arg procedure with fiscalYear-first order when date-range-first fails', async () => {
  let procedureAttempt = 0;
  const attemptedParams = [];
  const { conn, calls } = createMockConnection({ balanceRows: [] });
  const originalQuery = conn.query;
  conn.query = async (sql, params = []) => {
    if (sql.includes('CALL `dynrep_1_sp_trial_balance_expandable`(?, ?, ?, ?)')) {
      procedureAttempt += 1;
      attemptedParams.push(params);
      if (procedureAttempt === 1) {
        throw new Error("Incorrect integer value: '2025-01-01' for column 'p_fiscal_year' at row 1");
      }
    }
    return originalQuery(sql, params);
  };

  const result = await closeFiscalPeriod({
    companyId: 1,
    fiscalYear: 2025,
    userId: 'tester',
    reportProcedures: ['dynrep_1_sp_trial_balance_expandable'],
    dbPool: asPool(conn),
  });

  assert.equal(result.ok, true);
  assert.equal(procedureAttempt, 2);
  assert.deepEqual(attemptedParams[0], [1, '2025-01-01', '2025-12-31', 2025]);
  assert.deepEqual(attemptedParams[1], [1, 2025, '2025-01-01', '2025-12-31']);
  assert.ok(calls.some((c) => c.type === 'query' && c.sql.includes('CALL `dynrep_1_sp_trial_balance_expandable`(?, ?, ?, ?)')));
});

test('closeFiscalPeriod falls back to 2-arg procedure signature when 4-arg signature is unsupported', async () => {
  const { conn, calls } = createMockConnection({ balanceRows: [] });
  const originalQuery = conn.query;
  conn.query = async (sql, params = []) => {
    if (sql.includes('CALL `dynrep_1_sp_trial_balance_expandable`(?, ?, ?, ?)')) {
      throw new Error('Incorrect number of arguments for PROCEDURE mgtmn_erp_db.dynrep_1_sp_trial_balance_expandable; expected 2, got 4');
    }
    return originalQuery(sql, params);
  };

  const result = await closeFiscalPeriod({
    companyId: 1,
    fiscalYear: 2025,
    userId: 'tester',
    reportProcedures: ['dynrep_1_sp_trial_balance_expandable'],
    dbPool: asPool(conn),
  });

  assert.equal(result.ok, true);
  assert.ok(calls.some((c) => c.type === 'query' && c.sql.includes('CALL `dynrep_1_sp_trial_balance_expandable`(?, ?)')));
});


test('closeFiscalPeriod falls back to 3-arg date-range procedure when 4-arg signature is unsupported', async () => {
  const { conn, calls } = createMockConnection({ balanceRows: [] });
  const originalQuery = conn.query;
  conn.query = async (sql, params = []) => {
    if (sql.includes('CALL `dynrep_1_sp_trial_balance_expandable`(?, ?, ?, ?)')) {
      throw new Error('Incorrect number of arguments for PROCEDURE mgtmn_erp_db.dynrep_1_sp_trial_balance_expandable; expected 3, got 4');
    }
    return originalQuery(sql, params);
  };

  const result = await closeFiscalPeriod({
    companyId: 1,
    fiscalYear: 2025,
    userId: 'tester',
    reportProcedures: ['dynrep_1_sp_trial_balance_expandable'],
    dbPool: asPool(conn),
  });

  assert.equal(result.ok, true);
  assert.ok(calls.some((c) => c.type === 'query' && c.sql.includes('CALL `dynrep_1_sp_trial_balance_expandable`(?, ?, ?)') && JSON.stringify(c.params) === JSON.stringify([1, '2025-01-01', '2025-12-31'])));
});

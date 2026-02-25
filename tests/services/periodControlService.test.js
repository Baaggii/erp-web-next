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

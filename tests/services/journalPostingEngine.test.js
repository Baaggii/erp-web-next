import test from 'node:test';
import assert from 'node:assert/strict';

import { post_single_transaction } from '../../api-server/services/journalPostingEngine.js';

function createDbPool(queryHandler) {
  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async query(sql, params) {
      return queryHandler(sql, params);
    },
    release() {},
  };

  return {
    async getConnection() {
      return conn;
    },
  };
}

test('post_single_transaction returns existing journal for already posted row', async () => {
  const inserts = [];
  const dbPool = createDbPool(async (sql, params) => {
    if (sql.includes('SELECT * FROM `transactions_sales`')) {
      return [[{ id: 7, TransType: 'SALE', fin_post_status: 'POSTED', fin_journal_id: 91 }]];
    }
    if (sql.includes('information_schema.COLUMNS') && params?.[0] === 'fin_posting_log') {
      return [[
        { COLUMN_NAME: 'source_table' },
        { COLUMN_NAME: 'source_id' },
        { COLUMN_NAME: 'status' },
        { COLUMN_NAME: 'error_message' },
        { COLUMN_NAME: 'created_at' },
      ]];
    }
    if (sql.startsWith('INSERT INTO `fin_posting_log`')) {
      inserts.push(params);
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });

  const journalId = await post_single_transaction({
    source_table: 'transactions_sales',
    source_id: 7,
    dbPool,
  });

  assert.equal(journalId, 91);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][2], 'SUCCESS');
});

test('post_single_transaction skips FS_NON_FINANCIAL transactions', async () => {
  const inserts = [];
  const dbPool = createDbPool(async (sql, params) => {
    if (sql.includes('SELECT * FROM `transactions_misc`')) {
      return [[{ id: 11, TransType: 'NOTE', fin_post_status: null, fin_journal_id: null }]];
    }
    if (sql.includes('FROM code_transaction')) {
      return [[{ fin_flag_set_code: 'FS_NON_FINANCIAL' }]];
    }
    if (sql.includes('information_schema.COLUMNS') && params?.[0] === 'fin_posting_log') {
      return [[
        { COLUMN_NAME: 'source_table' },
        { COLUMN_NAME: 'source_id' },
        { COLUMN_NAME: 'status' },
        { COLUMN_NAME: 'error_message' },
        { COLUMN_NAME: 'created_at' },
      ]];
    }
    if (sql.startsWith('INSERT INTO `fin_posting_log`')) {
      inserts.push(params);
      return [{ insertId: 2 }];
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });

  const journalId = await post_single_transaction({
    source_table: 'transactions_misc',
    source_id: 11,
    dbPool,
  });

  assert.equal(journalId, null);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][2], 'SUCCESS');
  assert.match(inserts[0][3], /Skipped non-financial/);
});


test('post_single_transaction scopes company-aware lookups with transaction company_id', async () => {
  const seen = {
    ruleCompanyId: null,
    resolverCompanyId: null,
    coaCompanyId: null,
  };

  const dbPool = createDbPool(async (sql, params) => {
    if (sql.includes('SELECT * FROM `transactions_sales`')) {
      return [[{ id: 13, TransType: 'SALE', company_id: 9, fin_post_status: null, fin_journal_id: null }]];
    }
    if (sql.includes('FROM code_transaction')) {
      return [[{ fin_flag_set_code: 'FS_GL' }]];
    }
    if (sql.includes('FROM fin_transaction_field_map')) {
      return [[{ source_column: 'amount', canonical_field: 'TOTAL_AMOUNT' }]];
    }
    if (sql.includes('FROM fin_journal_rule_line')) {
      return [[{ id: 1, rule_id: 1, line_order: 1, dr_cr: 'DEBIT', account_resolver_code: 'AR1', amount_expression_code: 'AE1' }]];
    }
    if (sql.includes('FROM fin_journal_rule_condition')) {
      return [[{ rule_id: 1, condition_type: 'REQUIRED', flag_code: null }]];
    }
    if (sql.includes('FROM fin_journal_rule')) {
      seen.ruleCompanyId = params?.[1] ?? null;
      return [[{ rule_id: 1, id: 1 }]];
    }
    if (sql.includes('FROM fin_account_resolver')) {
      seen.resolverCompanyId = params?.[1] ?? null;
      return [[{ resolver_code: 'AR1', resolver_type: 'FIXED_ACCOUNT', base_account_code: '1001' }]];
    }
    if (sql.includes('FROM fin_chart_of_accounts')) {
      seen.coaCompanyId = params?.[1] ?? null;
      return [[{ account_code: '1001', is_active: 1 }]];
    }
    if (sql.includes('FROM fin_amount_expression')) {
      return [[{ expression_code: 'AE1', source_type: 'COLUMN', source_column: 'TOTAL_AMOUNT' }]];
    }
    if (sql.startsWith('INSERT INTO `fin_journal_header`')) {
      return [{ insertId: 501 }];
    }
    if (sql.startsWith('INSERT INTO `fin_journal_line`')) {
      return [{ insertId: 601 }];
    }
    if (sql.startsWith('UPDATE `transactions_sales` SET')) {
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      const tableName = params?.[0];
      if (tableName === 'fin_posting_log') {
        return [[
          { COLUMN_NAME: 'source_table' },
          { COLUMN_NAME: 'source_id' },
          { COLUMN_NAME: 'status' },
          { COLUMN_NAME: 'error_message' },
          { COLUMN_NAME: 'created_at' },
        ]];
      }
      if (tableName === 'fin_journal_header') {
        return [[
          { COLUMN_NAME: 'source_table' },
          { COLUMN_NAME: 'source_id' },
          { COLUMN_NAME: 'document_date' },
          { COLUMN_NAME: 'currency' },
          { COLUMN_NAME: 'exchange_rate' },
          { COLUMN_NAME: 'is_posted' },
          { COLUMN_NAME: 'created_at' },
        ]];
      }
      if (tableName === 'fin_journal_line') {
        return [[
          { COLUMN_NAME: 'journal_id' },
          { COLUMN_NAME: 'line_order' },
          { COLUMN_NAME: 'dr_cr' },
          { COLUMN_NAME: 'account_code' },
          { COLUMN_NAME: 'amount' },
          { COLUMN_NAME: 'dimension_type_code' },
          { COLUMN_NAME: 'dimension_id' },
        ]];
      }
      if (tableName === 'transactions_sales') {
        return [[
          { COLUMN_NAME: 'fin_post_status' },
          { COLUMN_NAME: 'fin_journal_id' },
          { COLUMN_NAME: 'fin_posted_at' },
        ]];
      }
    }
    if (sql.startsWith('INSERT INTO `fin_posting_log`')) {
      return [{ insertId: 3 }];
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });

  const journalId = await post_single_transaction({
    source_table: 'transactions_sales',
    source_id: 13,
    dbPool,
  });

  assert.equal(journalId, 501);
  assert.equal(seen.ruleCompanyId, 9);
  assert.equal(seen.resolverCompanyId, 9);
  assert.equal(seen.coaCompanyId, 9);
});

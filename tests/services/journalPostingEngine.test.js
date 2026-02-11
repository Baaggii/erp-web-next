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

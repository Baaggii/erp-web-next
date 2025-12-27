import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';
import { upsertCodingTableRow } from '../../api-server/services/codingTableRowUpsert.js';

test('upsertCodingTableRow drops self-updating triggers before insert', async () => {
  const originalGetConnection = db.pool.getConnection;
  const queries = [];
  const dropped = new Set();
  let commitCalled = false;
  let rollbackCalled = false;
  let released = false;

  const conn = {
    async beginTransaction() {
      queries.push({ sql: 'BEGIN' });
    },
    async query(sql, params) {
      queries.push({ sql, params });
      if (/information_schema\.triggers/i.test(sql)) {
        return [[
          {
            TRIGGER_NAME: 'trg_transactions_income_insert',
            ACTION_STATEMENT:
              'UPDATE transactions_income ti\n  JOIN code_transaction ct ON ct.UITransType = NEW.TransType\n  SET ti.TRTYPENAME = ct.UITransTypeName\n  WHERE ti.id = NEW.id;',
          },
          {
            TRIGGER_NAME: 'trg_transactions_income_update',
            ACTION_STATEMENT:
              'UPDATE `transactions_income` SET TRTYPENAME = NEW.TRTYPENAME WHERE id = NEW.id;',
          },
          {
            TRIGGER_NAME: 'trg_other_table',
            ACTION_STATEMENT: 'UPDATE other_table SET value = NEW.value;',
          },
        ]];
      }
      if (sql.startsWith('DROP TRIGGER')) {
        const match = sql.match(/`([^`]+)`/);
        if (match) dropped.add(match[1]);
        return [{}];
      }
      if (sql.startsWith('SELECT UITransTypeName')) {
        return [[{ UITransTypeName: 'Income type', UITrtype: 'IN' }]];
      }
      if (sql.startsWith('INSERT INTO `transactions_income`')) {
        if (!dropped.has('trg_transactions_income_insert') || !dropped.has('trg_transactions_income_update')) {
          const err = new Error('Cannot update table');
          err.errno = 1442;
          throw err;
        }
        return [{ affectedRows: 1, insertId: 42 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async commit() {
      commitCalled = true;
      queries.push({ sql: 'COMMIT' });
    },
    async rollback() {
      rollbackCalled = true;
      queries.push({ sql: 'ROLLBACK' });
    },
    release() {
      released = true;
    },
  };

  db.pool.getConnection = async () => conn;

  try {
    const result = await upsertCodingTableRow('transactions_income', { id: 7, TransType: 'TX' }, { user: { role: 'admin' } });
    assert.equal(result.inserted, 1);
    assert.equal(result.insertId, 42);
    assert.ok(commitCalled);
    assert.ok(!rollbackCalled);
    assert.ok(released);
    assert.ok(dropped.has('trg_transactions_income_insert'));
    assert.ok(dropped.has('trg_transactions_income_update'));
    assert.ok(!dropped.has('trg_other_table'));
    const insertIndex = queries.findIndex((q) => q.sql?.startsWith('INSERT INTO `transactions_income`'));
    assert.notEqual(insertIndex, -1);
    const dropIndices = queries
      .map((q, idx) => (q.sql?.startsWith('DROP TRIGGER') ? idx : -1))
      .filter((idx) => idx !== -1);
    assert.ok(dropIndices.length >= 2);
    dropIndices.forEach((idx) => assert.ok(idx < insertIndex));
  } finally {
    db.pool.getConnection = originalGetConnection;
  }
});

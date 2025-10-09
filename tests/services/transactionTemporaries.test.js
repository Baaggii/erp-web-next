import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';
import {
  getTemporarySummary,
  sanitizeCleanedValuesForInsert,
} from '../../api-server/services/transactionTemporaries.js';

function mockQuery(handler) {
  const original = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = original;
  };
}

test('getTemporarySummary marks reviewers even without pending temporaries', async () => {
  const restore = mockQuery(async (sql) => {
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) {
      return [[], []];
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
  } finally {
    restore();
  }
});

test('sanitizeCleanedValuesForInsert drops non-columns and reserved rows payload', async () => {
  const columns = ['id', 'employee_name', 'Amount', 'attachments'];
  const sanitized = await sanitizeCleanedValuesForInsert(
    'transactions_demo',
    {
      employee_name: 'Alice',
      amount: 125.5,
      rows: [{ id: 1 }],
      extra_field: 'ignore me',
      attachments: [{ name: 'file.pdf' }],
    },
    columns,
  );
  assert.deepEqual(sanitized, {
    employee_name: 'Alice',
    Amount: 125.5,
    attachments: JSON.stringify([{ name: 'file.pdf' }]),
  });
});

test('sanitizeCleanedValuesForInsert ignores non-plain objects', async () => {
  const sanitizedFromArray = await sanitizeCleanedValuesForInsert(
    'transactions_demo',
    [
      {
        employee_name: 'Bob',
      },
    ],
    ['employee_name'],
  );
  assert.deepEqual(sanitizedFromArray, {});

  const sanitizedFromNull = await sanitizeCleanedValuesForInsert(
    'transactions_demo',
    null,
    ['employee_name'],
  );
  assert.deepEqual(sanitizedFromNull, {});
});

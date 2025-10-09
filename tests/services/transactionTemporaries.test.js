import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';
import {
  getTemporarySummary,
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

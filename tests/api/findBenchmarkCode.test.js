import test from 'node:test';
import assert from 'node:assert/strict';
import { findBenchmarkCode } from '../../api-server/services/transactionImageService.js';
import * as db from '../../db/index.js';

function mockPool(handler) {
  const orig = db.pool.query;
  db.pool.query = handler;
  return () => { db.pool.query = orig; };
}

await test('findBenchmarkCode matches codes', async () => {
  const restore = mockPool(async (sql, params) => {
    if (/FROM code_transaction WHERE UITransType =/.test(sql)) {
      if (params[0] === '1234') return [[{ UITransType: '1234' }]];
      return [[]];
    }
    if (/FROM code_transaction WHERE image_benchmark = 1/.test(sql)) {
      return [[{ UITransType: '5678', UITrtype: 'ABCD' }]];
    }
    return [[]];
  });

  assert.equal(await findBenchmarkCode('img_1234_test.jpg'), '1234');
  assert.equal(await findBenchmarkCode('foo_abcd.jpg'), '5678');
  assert.equal(await findBenchmarkCode('none.jpg'), null);

  restore();
});

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
    if (/image_benchmark = 1 AND UITransType =/.test(sql)) {
      if (params[0] === '3001') return [[{ UITransType: '3001' }]];
      return [[]];
    }
    if (/FROM code_transaction WHERE image_benchmark = 1/.test(sql)) {
      return [[{ UITransType: '4000', UITrtype: 'ABCD' }]];
    }
    return [[]];
  });

  assert.deepEqual(await findBenchmarkCode('1111_3001_5.png'), { code: '3001', qty: 5 });
  assert.deepEqual(await findBenchmarkCode('foo_abcd_20.jpg'), { code: '4000', qty: 20 });
  assert.equal(await findBenchmarkCode('none.jpg'), null);

  restore();
});

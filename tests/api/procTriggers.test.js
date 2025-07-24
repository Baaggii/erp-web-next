import test from 'node:test';
import assert from 'node:assert/strict';
import { getProcTriggers } from '../../api-server/services/procTriggers.js';
import { pool } from '../../db/index.js';

const origQuery = pool.query;

pool.query = async () => [[{ Statement: `CALL foo(NEW.a, v_b); SET NEW.c = v_b;` }]];

await test('getProcTriggers maps keys to output columns', async () => {
  const trig = await getProcTriggers('t');
  assert.deepEqual(trig, {
    a: [
      {
        name: 'foo',
        params: ['a', 'v_b'],
        outMap: { v_b: 'c' },
      },
    ],
    c: [
      {
        name: 'foo',
        params: ['a', 'v_b'],
        outMap: { v_b: 'c' },
      },
    ],
  });
});

pool.query = origQuery;

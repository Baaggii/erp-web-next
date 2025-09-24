import test from 'node:test';
import assert from 'node:assert/strict';
import { getProcTriggers } from '../../api-server/services/procTriggers.js';
import { pool } from '../../db/index.js';

const origQuery = pool.query;

await test('getProcTriggers maps keys to output columns', async () => {
  pool.query = async () => [[{ Statement: `CALL foo(NEW.a, v_b); SET NEW.c = v_b;` }]];
  try {
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
  } finally {
    pool.query = origQuery;
  }
});

await test('getProcTriggers supports user variables', async () => {
  pool.query = async () => [
    [
      {
        Statement: `CALL bar(NEW.some_input, @out_val); SET NEW.some_col = @out_val;`,
      },
    ],
  ];
  try {
    const trig = await getProcTriggers('t');
    assert.ok(trig.some_input?.length > 0, 'maps source column as trigger');
    assert.ok(trig.some_col?.length > 0, 'maps target column as trigger');
    const cfg = trig.some_col[0];
    assert.equal(cfg.name, 'bar');
    assert.deepEqual(cfg.params, ['some_input', 'out_val']);
    assert.deepEqual(cfg.outMap, { out_val: 'some_col' });
    const aliases = cfg.params.map((p) => cfg.outMap[p] || null);
    assert.deepEqual(aliases, [null, 'some_col']);
  } finally {
    pool.query = origQuery;
  }
});

await test('getProcTriggers maps wrapped output variables', async () => {
  pool.query = async () => [
    [
      {
        Statement: `CALL baz(NEW.amount, @out_total); SET NEW.total = IFNULL(@out_total, 0);`,
      },
    ],
  ];
  try {
    const trig = await getProcTriggers('t');
    assert.ok(trig.amount?.length > 0, 'maps source column as trigger');
    assert.ok(trig.total?.length > 0, 'maps target column as trigger');
    const cfg = trig.total[0];
    assert.equal(cfg.name, 'baz');
    assert.deepEqual(cfg.params, ['amount', 'out_total']);
    assert.deepEqual(cfg.outMap, { out_total: 'total' });
    const aliases = cfg.params.map((p) => cfg.outMap[p] || null);
    assert.deepEqual(aliases, [null, 'total']);
  } finally {
    pool.query = origQuery;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import reportDefinitionToConfig from '../../src/erp.mgt.mn/utils/reportDefinitionToConfig.js';

// simplified buildFromState for testing conversion round-trip
function buildFromState(st) {
  const { fromTable: ft, joins: js = [], fields: fs = [], groups: gs = [], conditions: cs = [] } = st;
  const aliases = {};
  if (ft) aliases[ft] = 't0';
  (js || []).forEach((j, idx) => {
    const al = j.alias || `t${idx + 1}`;
    aliases[j.table] = al;
  });

  const select = fs.map((f) => ({
    expr: `${aliases[f.table]}.${f.field}`,
    alias: f.alias || undefined,
  }));

  const joins = (js || []).map((j) => {
    const alias = aliases[j.table];
    const targetAlias = aliases[j.targetTable];
    const onInner = (j.conditions || [])
      .map((c, i) => {
        const connector = i > 0 ? ` ${c.connector} ` : '';
        const open = '('.repeat(c.open || 0);
        const close = ')'.repeat(c.close || 0);
        return (
          connector +
          `${open}${targetAlias}.${c.fromField} = ${alias}.${c.toField}${close}`
        );
      })
      .join('');
    const on = (j.conditions || []).length > 1 ? `(${onInner})` : onInner;
    return { table: j.table, alias, type: j.type, on };
  });

  const where = (cs || []).map((c) => ({
    expr: c.raw,
    connector: c.connector,
    open: c.open,
    close: c.close,
  }));

  const groupBy = (gs || []).map((g) => `${aliases[g.table]}.${g.field}`);

  return {
    from: { table: ft, alias: aliases[ft] },
    joins,
    select,
    where,
    groupBy,
    having: [],
  };
}

test('reportDefinitionToConfig round trip', () => {
  const def = {
    from: { table: 'users', alias: 't0' },
    joins: [
      {
        table: 'orders',
        alias: 't1',
        type: 'LEFT JOIN',
        on: 't0.id = t1.user_id',
      },
    ],
    select: [
      { expr: 't0.id', alias: 'user_id' },
      { expr: 't1.amount', alias: 'order_amount' },
    ],
    where: [{ expr: 't0.active = 1', connector: undefined, open: 0, close: 0 }],
    groupBy: ['t0.id', 't1.amount', 't1.amount'],
    having: [],
  };

  const cfg = reportDefinitionToConfig(def);
  const rebuilt = buildFromState(cfg);

  assert.deepEqual(rebuilt, {
    from: { table: 'users', alias: 't0' },
    joins: [
      {
        table: 'orders',
        alias: 't1',
        type: 'LEFT JOIN',
        on: 't0.id = t1.user_id',
      },
    ],
    select: [
      { expr: 't0.id', alias: 'user_id' },
      { expr: 't1.amount', alias: 'order_amount' },
    ],
    where: [{ expr: 't0.active = 1', connector: undefined, open: 0, close: 0 }],
    groupBy: ['t0.id', 't1.amount'],
    having: [],
  });
});

test('reportDefinitionToConfig captures fromFilters', () => {
  const def = {
    from: { table: 'orders', alias: 't0' },
    select: [{ expr: 't0.id' }],
    fromFilters: [
      { expr: 't0.branch_id = :branch', connector: undefined, open: 0, close: 0 },
    ],
  };
  const cfg = reportDefinitionToConfig(def);
  assert.deepEqual(cfg.fromFilters, [
    { raw: 't0.branch_id = :branch', connector: undefined, open: 0, close: 0 },
  ]);
});

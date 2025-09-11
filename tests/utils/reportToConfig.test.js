import test from 'node:test';
import assert from 'node:assert/strict';
import reportToConfig from '../../src/erp.mgt.mn/utils/reportToConfig.js';

// Minimal stand-in for ReportBuilder buildFromState
function buildFromState(st) {
  const aliasMap = {};
  aliasMap[st.fromTable] = 't0';
  (st.joins || []).forEach((j, i) => {
    const alias = j.alias || `t${i + 1}`;
    aliasMap[j.table] = alias;
  });

  const from = { table: st.fromTable, alias: 't0' };

  const joins = (st.joins || []).map((j) => {
    const leftAlias = aliasMap[j.targetTable];
    const alias = aliasMap[j.table];
    const on = (j.conditions || [])
      .map((c, idx) => {
        const connector = idx > 0 ? ` ${c.connector || 'AND'} ` : '';
        const open = '('.repeat(c.open || 0);
        const close = ')'.repeat(c.close || 0);
        return (
          connector +
          `${open}${leftAlias}.${c.fromField} = ${alias}.${c.toField}${close}`
        );
      })
      .join('');
    return { table: j.table, alias: j.alias, type: j.type, on };
  });

  const select = (st.fields || []).map((f) => {
    if (f.source === 'field') {
      return { expr: `${aliasMap[f.table]}.${f.field}`, alias: f.alias || undefined };
    }
    return { expr: f.baseAlias || '', alias: f.alias || undefined };
  });

  const where = (st.conditions || []).map((c) => {
    if (c.raw) {
      return {
        expr: c.raw,
        connector: c.connector,
        open: c.open,
        close: c.close,
      };
    }
    return {
      expr: `${aliasMap[c.table]}.${c.field} = :${c.param}`,
      connector: c.connector,
      open: c.open,
      close: c.close,
    };
  });

  const groupBy = (st.groups || []).map(
    (g) => `${aliasMap[g.table]}.${g.field}`,
  );

  return { from, joins, select, where, groupBy, having: [], unions: [] };
}

const sample = {
  from: { table: 'prod', alias: 't0' },
  select: [
    { expr: 't0.id', alias: 'id' },
    { expr: 't1.name', alias: 'cat_name' },
  ],
  joins: [
    { table: 'cat', alias: 't1', type: 'JOIN', on: 't0.cat_id = t1.id' },
  ],
  where: [
    {
      expr: 't0.active = :active',
      connector: undefined,
      open: undefined,
      close: undefined,
    },
  ],
  groupBy: [],
  having: [],
  unions: [],
};

test('reportToConfig round trips through buildFromState', () => {
  const cfg = reportToConfig(sample);
  const rebuilt = buildFromState(cfg);
  assert.deepEqual(rebuilt, sample);
});

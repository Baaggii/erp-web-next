export default function reportDefinitionToConfig(def = {}) {
  const cfg = {
    fromTable: def.from?.table || '',
    joins: [],
    fields: [],
    groups: [],
    conditions: [],
    having: [],
  };

  const aliasToTable = {};
  if (def.from) {
    aliasToTable[def.from.alias || def.from.table] = def.from.table;
  }

  // collect join aliases first
  (def.joins || []).forEach((j) => {
    const al = j.alias || j.table;
    aliasToTable[al] = j.table;
  });

  // build select alias map and field configs
  const aliasExprMap = {};
  (def.select || []).forEach((s) => {
    if (s.alias) aliasExprMap[s.alias] = s.expr;
    const m = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/.exec(s.expr || '');
    if (m && aliasToTable[m[1]]) {
      cfg.fields.push({
        source: 'field',
        table: aliasToTable[m[1]],
        field: m[2],
        alias: s.alias || '',
        aggregate: 'NONE',
        calcParts: [],
        conditions: [],
      });
    } else {
      cfg.fields.push({
        source: 'alias',
        baseAlias: s.expr,
        alias: s.alias || '',
        aggregate: 'NONE',
        calcParts: [],
        conditions: [],
      });
    }
  });

  // parse join conditions
  (def.joins || []).forEach((j, idx) => {
    const alias = j.alias || j.table;
    const conds = parseJoinConditions(j.on || '');
    let targetAlias = '';
    if (conds.length) {
      const c0 = conds[0];
      targetAlias = c0.leftAlias === alias ? c0.rightAlias : c0.leftAlias;
    }
    const targetTable = aliasToTable[targetAlias] || targetAlias;
    const conditions = conds.map((c) => {
      const fromSide = c.leftAlias === targetAlias ? c.leftField : c.rightField;
      const toSide = c.leftAlias === targetAlias ? c.rightField : c.leftField;
      return {
        fromField: fromSide,
        toField: toSide,
        connector: c.connector || 'AND',
        open: c.open || 0,
        close: c.close || 0,
      };
    });
    cfg.joins.push({
      table: j.table,
      alias: j.alias || '',
      type: j.type,
      targetTable,
      conditions,
      filters: [],
    });
  });

  // where conditions as raw
  (def.where || []).forEach((w) => {
    cfg.conditions.push({
      raw: w.expr,
      connector: w.connector,
      open: w.open || 0,
      close: w.close || 0,
    });
  });

  // groupBy dedupe
  const groupSet = new Set();
  (def.groupBy || []).forEach((g) => {
    let expr = g;
    if (aliasExprMap[expr]) expr = aliasExprMap[expr];
    const m = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/.exec(expr);
    if (m && aliasToTable[m[1]]) {
      const table = aliasToTable[m[1]];
      const field = m[2];
      const key = `${table}.${field}`;
      if (!groupSet.has(key)) {
        groupSet.add(key);
        cfg.groups.push({ table, field });
      }
    }
  });

  // having clause - raw strings converted similar to where
  (def.having || []).forEach((h) => {
    cfg.having.push({
      raw: h.expr,
      connector: h.connector,
      open: h.open || 0,
      close: h.close || 0,
    });
  });

  return cfg;
}

function parseJoinConditions(text = '') {
  const res = [];
  let i = 0;
  let connector;
  const len = text.length;
  while (i < len) {
    while (i < len && /\s/.test(text[i])) i++;
    let open = 0;
    while (text[i] === '(') {
      open++;
      i++;
      while (i < len && /\s/.test(text[i])) i++;
    }
    const leftMatch = /([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/.exec(text.slice(i));
    if (!leftMatch) break;
    const leftAlias = leftMatch[1];
    const leftField = leftMatch[2];
    i += leftMatch.index + leftMatch[0].length;
    while (i < len && /\s/.test(text[i])) i++;
    if (text[i] !== '=') break;
    i++;
    while (i < len && /\s/.test(text[i])) i++;
    const rightMatch = /([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/.exec(text.slice(i));
    if (!rightMatch) break;
    const rightAlias = rightMatch[1];
    const rightField = rightMatch[2];
    i += rightMatch.index + rightMatch[0].length;
    while (i < len && /\s/.test(text[i])) i++;
    let close = 0;
    while (text[i] === ')') {
      close++;
      i++;
      while (i < len && /\s/.test(text[i])) i++;
    }
    res.push({ leftAlias, leftField, rightAlias, rightField, connector, open, close });
    const rest = text.slice(i).toUpperCase();
    if (rest.startsWith('AND')) {
      connector = 'AND';
      i += 3;
    } else if (rest.startsWith('OR')) {
      connector = 'OR';
      i += 2;
    } else {
      connector = undefined;
      break;
    }
  }
  return res;
}

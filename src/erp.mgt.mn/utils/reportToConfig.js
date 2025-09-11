export default function reportToConfig(report = {}) {
  if (!report || typeof report !== 'object') return {};

  function convert(rep = {}) {
    const aliasMap = {};
    const fromAlias = rep.from?.alias || 't0';
    if (rep.from?.table) aliasMap[fromAlias] = rep.from.table;
    (rep.joins || []).forEach((j, idx) => {
      const alias = j.alias || `t${idx + 1}`;
      aliasMap[alias] = j.table;
    });

    const fromTable = rep.from?.table || '';

    function parseJoin(j = {}) {
      const conditions = [];
      let targetAlias = fromAlias;
      if (j.on) {
        const parts = j.on.split(/\s+(AND|OR)\s+/i).filter(Boolean);
        let connector;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (/^(AND|OR)$/i.test(part)) {
            connector = part.toUpperCase();
            continue;
          }
          const m = part.match(/^(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)$/);
          if (m) {
            const [, leftAlias, leftField, rightAlias, rightField] = m;
            targetAlias = leftAlias;
            conditions.push({
              fromField: leftField,
              toField: rightField,
              connector: connector || 'AND',
            });
            connector = undefined;
          }
        }
      }
      return {
        table: j.table,
        alias: j.alias,
        type: j.type,
        targetTable: aliasMap[targetAlias],
        conditions,
        filters: [],
      };
    }

    function parseField(s = {}) {
      const m = (s.expr || '').match(/^(\w+)\.(\w+)$/);
      if (m) {
        const [, a, f] = m;
        return {
          source: 'field',
          table: aliasMap[a],
          field: f,
          baseAlias: '',
          alias: s.alias || '',
          aggregate: 'NONE',
          calcParts: [],
          conditions: [],
        };
      }
      return {
        source: 'alias',
        table: '',
        field: '',
        baseAlias: s.expr || '',
        alias: s.alias || '',
        aggregate: 'NONE',
        calcParts: [],
        conditions: [],
      };
    }

    function parseGroup(g = '') {
      const m = g.match(/^(\w+)\.(\w+)$/);
      if (m) return { table: aliasMap[m[1]], field: m[2] };
      return { table: '', field: g };
    }

    function parseWhere(w = {}) {
      const m = (w.expr || '').match(/^(\w+)\.(\w+)\s*=\s*:(\w+)$/);
      if (m) {
        return {
          table: aliasMap[m[1]],
          field: m[2],
          operator: '=',
          param: m[3],
          connector: w.connector,
          open: w.open,
          close: w.close,
        };
      }
      return {
        raw: w.expr,
        connector: w.connector,
        open: w.open,
        close: w.close,
      };
    }

    function parseHaving(h = {}) {
      const aggRe = /^(SUM|COUNT|AVG|MIN|MAX)\((\w+)\.(\w+)\)\s*(=|!=|>|<|>=|<=)\s*:(\w+)$/i;
      const m = (h.expr || '').match(aggRe);
      if (m) {
        const [, agg, a, f, op, param] = m;
        return {
          source: 'field',
          aggregate: agg.toUpperCase(),
          table: aliasMap[a],
          field: f,
          operator: op,
          valueType: 'param',
          param,
          connector: h.connector,
          open: h.open,
          close: h.close,
        };
      }
      const aliasMatch = (h.expr || '').match(/^(\w+)\s*(=|!=|>|<|>=|<=)\s*:(\w+)$/);
      if (aliasMatch) {
        const [, al, op, param] = aliasMatch;
        return {
          source: 'alias',
          alias: al,
          operator: op,
          valueType: 'param',
          param,
          connector: h.connector,
          open: h.open,
          close: h.close,
        };
      }
      return { raw: h.expr, connector: h.connector, open: h.open, close: h.close };
    }

    return {
      fromTable,
      joins: (rep.joins || []).map((j) => parseJoin(j)),
      fields: (rep.select || []).map((s) => parseField(s)),
      groups: (rep.groupBy || []).map((g) => parseGroup(g)),
      having: (rep.having || []).map((h) => parseHaving(h)),
      conditions: (rep.where || []).map((w) => parseWhere(w)),
      fromFilters: [],
    };
  }

  const main = convert(report);
  const unionQueries = (report.unions || []).map((u) => convert(u));
  return { ...main, unionQueries };
}

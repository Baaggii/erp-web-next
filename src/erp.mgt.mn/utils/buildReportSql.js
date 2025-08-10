/**
 * Build a SQL statement from a report definition.
 * Preserves parameter placeholders such as :start_date.
 *
 * @param {object} definition
 * @returns {string} SQL string
 */
export default function buildReportSql(definition = {}) {
  if (!definition.from) throw new Error('definition.from is required');

  function build(def) {
    const parts = [];

    // SELECT clause with alias expansion
    const selectItems = (def.select || []).filter((s) => s && s.expr);
    const aliasMap = {};

    function expandExpr(expr) {
      let result = expr;
      let replaced = true;
      while (replaced) {
        replaced = false;
        for (const [al, ex] of Object.entries(aliasMap)) {
          const re = new RegExp(`\\b${al}\\b`, 'g');
          if (re.test(result)) {
            result = result.replace(re, `(${ex})`);
            replaced = true;
          }
        }
      }
      return result;
    }

    const selectList =
      selectItems
        .map((sel) => {
          const expr = expandExpr(sel.expr);
          if (sel.alias) aliasMap[sel.alias] = expr;
          return sel.alias ? `${expr} AS ${sel.alias}` : expr;
        })
        .join(',\n  ') || '*';
    parts.push(`SELECT${selectList ? '\n  ' + selectList : ''}`);

    // FROM clause
    parts.push(
      `FROM ${def.from.table}` + (def.from.alias ? ` ${def.from.alias}` : ''),
    );

    // JOIN clauses
    (def.joins || []).forEach(({ table, alias, type = 'JOIN', on }) => {
      if (!on) return;
      parts.push(`${type} ${table}` + (alias ? ` ${alias}` : '') + ` ON ${on}`);
    });

    // WHERE clause
    if (def.where?.length) {
      const whereItems = def.where.filter((w) => w && w.expr);
      if (whereItems.length) {
        const whereClause = whereItems
          .map((w, i) => {
            const connector = i > 0 ? `${w.connector || 'AND'} ` : '';
            const open = '('.repeat(w.open || 0);
            const close = ')'.repeat(w.close || 0);
            return connector + open + w.expr + close;
          })
          .join('\n  ');
        parts.push(`WHERE\n  ${whereClause}`);
      }
    }

    // GROUP BY clause
    const aggRe = /\b(SUM|COUNT|AVG|MIN|MAX)\s*\(/i;
    const hasAgg = selectItems.some((s) => aggRe.test(s.expr));
    const groupSet = new Set(def.groupBy || []);
    if (hasAgg) {
      selectItems.forEach((s) => {
        if (!aggRe.test(s.expr)) {
          const gb = s.alias || expandExpr(s.expr);
          if (gb) groupSet.add(gb);
        }
      });
    }
    if (groupSet.size) {
      parts.push(`GROUP BY ${Array.from(groupSet).join(', ')}`);
    }

    // HAVING clause
    if (def.having?.length) {
      const havingItems = def.having.filter((h) => h && h.expr);
      if (havingItems.length) {
        const havingClause = havingItems
          .map((h, i) => {
            const connector = i > 0 ? `${h.connector || 'AND'} ` : '';
            const open = '('.repeat(h.open || 0);
            const close = ')'.repeat(h.close || 0);
            return connector + open + h.expr + close;
          })
          .join('\n  ');
        parts.push(`HAVING\n  ${havingClause}`);
      }
    }

    return parts.join('\n');
  }

  const main = build(definition);
  // Subsequent UNION blocks, if any
  const unions = definition.unions || [];
  if (!unions.length) return main;
  const rest = unions.map((u) => ({
    type: u.type || 'UNION',
    sql: build(u),
  }));
  let combined = `(${main})`;
  rest.forEach(({ type, sql }) => {
    combined += `\n${type}\n(${sql})`;
  });
  return combined;
}


/**
 * Build a SQL statement from a report definition.
 * Preserves parameter placeholders such as :start_date.
 *
 * @param {object} definition
 * @returns {string} SQL string
 */
export default function buildReportSql(definition = {}) {
  if (!definition.from) throw new Error('definition.from is required');

  const parts = [];

  // SELECT clause with alias expansion
  const selectItems = (definition.select || []).filter((s) => s && s.expr);
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
    `FROM ${definition.from.table}` +
      (definition.from.alias ? ` ${definition.from.alias}` : '')
  );

  // JOIN clauses
  (definition.joins || []).forEach(({ table, alias, type = 'JOIN', on }) => {
    if (!on) return;
    parts.push(`${type} ${table}` + (alias ? ` ${alias}` : '') + ` ON ${on}`);
  });

  // WHERE clause
  if (definition.where?.length) {
    const whereItems = definition.where.filter((w) => w && w.expr);
    if (whereItems.length) {
      const whereClause = whereItems
        .map((w, i) => {
          const connector = i > 0 ? `${w.connector || 'AND'} ` : '';
          return connector + w.expr;
        })
        .join('\n  ');
      parts.push(`WHERE\n  ${whereClause}`);
    }
  }

  // GROUP BY clause
  if (definition.groupBy?.length) {
    parts.push(`GROUP BY ${definition.groupBy.join(', ')}`);
  }

  // HAVING clause
  if (definition.having?.length) {
    const havingItems = definition.having.filter((h) => h && h.expr);
    if (havingItems.length) {
      const havingClause = havingItems
        .map((h, i) => {
          const connector = i > 0 ? `${h.connector || 'AND'} ` : '';
          return connector + h.expr;
        })
        .join('\n  ');
      parts.push(`HAVING\n  ${havingClause}`);
    }
  }

  return parts.join('\n');
}

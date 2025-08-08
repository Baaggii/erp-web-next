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

  // SELECT clause
  const selectList = (definition.select || [])
    .map((sel) => (sel.alias ? `${sel.expr} AS ${sel.alias}` : sel.expr))
    .join(', ') || '*';
  parts.push(`SELECT ${selectList}`);

  // FROM clause
  parts.push(
    `FROM ${definition.from.table}` +
      (definition.from.alias ? ` ${definition.from.alias}` : '')
  );

  // JOIN clauses
  (definition.joins || []).forEach(({ table, alias, type = 'INNER', on }) => {
    parts.push(
      `${type} JOIN ${table}` + (alias ? ` ${alias}` : '') + ` ON ${on}`
    );
  });

  // WHERE clause
  if (definition.where?.length) {
    const whereClause = definition.where.map((w) => w.expr).join(' AND ');
    parts.push(`WHERE ${whereClause}`);
  }

  // GROUP BY clause
  if (definition.groupBy?.length) {
    parts.push(`GROUP BY ${definition.groupBy.join(', ')}`);
  }

  // HAVING clause
  if (definition.having?.length) {
    const havingClause = definition.having.map((h) => h.expr).join(' AND ');
    parts.push(`HAVING ${havingClause}`);
  }

  return parts.join('\n');
}

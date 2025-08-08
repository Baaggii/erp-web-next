export default function buildReportSql(definition) {
  const parts = [];

  // SELECT clause
  const selectList = (definition.select || [])
    .map(sel => sel.alias ? `${sel.expr} AS ${sel.alias}` : sel.expr)
    .join(', ');
  parts.push(`SELECT ${selectList}`);

  // FROM clause
  parts.push(
    `FROM ${definition.from.table}` +
    (definition.from.alias ? ` ${definition.from.alias}` : '')
  );

  // JOIN clauses
  (definition.joins || []).forEach(join => {
    const joinType = join.type ? `${join.type} JOIN` : 'INNER JOIN';
    parts.push(
      `${joinType} ${join.table}` +
      (join.alias ? ` ${join.alias}` : '') +
      ` ON ${join.on}`
    );
  });

  // WHERE clause
  if (definition.where && definition.where.length) {
    const whereClause = definition.where.map(w => w.expr).join(' AND ');
    parts.push(`WHERE ${whereClause}`);
  }

  // GROUP BY clause
  if (definition.groupBy && definition.groupBy.length) {
    parts.push(`GROUP BY ${definition.groupBy.join(', ')}`);
  }

  // HAVING clause
  if (definition.having && definition.having.length) {
    const havingClause = definition.having.map(h => h.expr).join(' AND ');
    parts.push(`HAVING ${havingClause}`);
  }

  return parts.join('\n');
}

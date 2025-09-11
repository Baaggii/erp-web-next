/**
 * Parse a stored procedure SQL for an embedded REPORT_BUILDER_CONFIG block.
 * When the block is missing, convert the SELECT statement into a report object
 * mirroring the report builder form state.
 */

export default function parseProcedureConfig(sql = '') {
  if (!sql) return { error: 'No SQL provided' };

  const match = sql.match(/\/\*REPORT_BUILDER_CONFIG\s*([\s\S]*?)\*\//i);
  if (match) {
    try {
      return { report: JSON.parse(match[1]), converted: false };
    } catch {
      throw new Error('Invalid REPORT_BUILDER_CONFIG JSON');
    }
  }

  const report = convertSql(sql);
  if (!report) return { error: 'REPORT_BUILDER_CONFIG not found' };
  return { report, converted: true };
}

function convertSql(sql) {
  let body = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .replace(/#.*$/gm, ' ')
    .trim();

  const selIdx = body.toUpperCase().indexOf('SELECT');
  if (selIdx === -1) return null;
  body = body.slice(selIdx);
  body = body.split(';')[0];

  const unionParts = splitTopLevel(body, /\bUNION\b/i);
  const main = parseSelectStatement(unionParts.shift());
  if (!main) return null;
  main.unions = unionParts.map((p) => parseSelectStatement(p));
  return main;
}

function parseSelectStatement(stmt = '') {
  const m = stmt.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+)/i);
  if (!m) return null;
  const selectPart = m[1].trim();
  const rest = m[2];

  const where = findClause(rest, 'WHERE');
  const group = findClause(rest, 'GROUP BY');
  const having = findClause(rest, 'HAVING');

  const clauseIdx = [where.index, group.index, having.index]
    .filter((i) => i !== -1)
    .sort((a, b) => a - b);
  const endIdx = clauseIdx.length ? clauseIdx[0] : rest.length;

  const fromJoinPart = rest.slice(0, endIdx).trim();

  const wherePart =
    where.index !== -1
      ? rest
          .slice(
            where.index + where.length,
            group.index !== -1
              ? group.index
              : having.index !== -1
              ? having.index
              : rest.length,
          )
          .trim()
      : '';

  const groupPart =
    group.index !== -1
      ? rest
          .slice(group.index + group.length, having.index !== -1 ? having.index : rest.length)
          .trim()
      : '';

  const havingPart =
    having.index !== -1 ? rest.slice(having.index + having.length).trim() : '';

  const { from, joins, fromFilters } = parseFromAndJoins(fromJoinPart);

  return {
    from,
    select: parseSelectList(selectPart),
    joins,
    where: parseConditions(wherePart),
    groupBy: parseGroupBy(groupPart),
    having: parseConditions(havingPart),
    unions: [],
    fromFilters,
  };
}

function parseSelectList(text) {
  return splitByComma(text).map((item) => {
    let expr = item.trim();
    let alias;
    const asMatch = expr.match(/\s+AS\s+([`"\w]+)/i);
    if (asMatch) {
      alias = strip(asMatch[1]);
      expr = expr.slice(0, asMatch.index).trim();
    } else {
      const aliasMatch = expr.match(/\s+([`"\w]+)$/);
      if (aliasMatch && !/\./.test(aliasMatch[1])) {
        alias = strip(aliasMatch[1]);
        expr = expr.slice(0, aliasMatch.index).trim();
      }
    }
    return { expr, alias };
  });
}

function parseGroupBy(text) {
  if (!text) return [];
  return splitByComma(text).map((s) => s.trim()).filter(Boolean);
}

function parseFromAndJoins(text) {
  const result = { from: { table: '', alias: '' }, joins: [], fromFilters: [] };
  if (!text) return result;

  let rest = text.trim();

  // detect subquery with alias e.g. (SELECT ... ) t0
  const subMatch = rest.match(/^\((SELECT[\s\S]+?)\)\s+(?:AS\s+)?([`"\w]+)/i);
  if (subMatch) {
    // alias becomes table and alias in result
    result.from.table = strip(subMatch[2]);
    result.from.alias = strip(subMatch[2]);

    // parse inner subquery to extract filters
    const inner = parseSelectStatement(subMatch[1]);
    if (inner) {
      result.fromFilters = inner.where || [];
      if (inner.fromFilters?.length) {
        result.fromFilters.push(...inner.fromFilters);
      }
    }

    rest = rest.slice(subMatch[0].length).trim();
  } else {
    const fromMatch = rest.match(/^([`"\w\.]+)(?:\s+(?:AS\s+)?([`"\w]+))?/i);
    if (!fromMatch) return result;
    result.from.table = strip(fromMatch[1]);
    result.from.alias = fromMatch[2] ? strip(fromMatch[2]) : result.from.table;
    rest = rest.slice(fromMatch[0].length).trim();
  }

  const joinRe =
    /(LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\s+([`"\w\.]+)(?:\s+(?:AS\s+)?([`"\w]+))?\s+(ON|USING)\s+([^]*?)(?=(LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN|$)/gi;
  let jm;
  while ((jm = joinRe.exec(rest))) {
    const type = jm[1] ? jm[1].trim().toUpperCase() + ' JOIN' : 'JOIN';
    const table = strip(jm[2]);
    const alias = jm[3] ? strip(jm[3]) : table;
    const on = jm[4].toUpperCase() === 'USING' ? `USING ${jm[5].trim()}` : jm[5].trim();
    result.joins.push({ table, alias, type, on });
  }
  return result;
}

function parseConditions(text) {
  if (!text) return [];
  const res = [];
  let i = 0;
  const len = text.length;
  let connector;
  while (i < len) {
    while (i < len && /\s/.test(text[i])) i++;
    let open = 0;
    while (text[i] === '(') {
      open++;
      i++;
      while (i < len && /\s/.test(text[i])) i++;
    }
    let expr = '';
    let depth = 0;
    let quote = null;
    while (i < len) {
      const rest = text.slice(i).toUpperCase();
      if (!quote && depth === 0 && (rest.startsWith('AND ') || rest.startsWith('OR ') || rest === 'AND' || rest === 'OR'))
        break;
      const ch = text[i];
      if (quote) {
        if (ch === quote && text[i - 1] !== '\\') quote = null;
        expr += ch;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        expr += ch;
        i++;
        continue;
      }
      if (ch === '(') {
        depth++;
        expr += ch;
        i++;
        continue;
      }
      if (ch === ')') {
        if (depth === 0) break;
        depth--;
        expr += ch;
        i++;
        continue;
      }
      expr += ch;
      i++;
    }
    let close = 0;
    while (i < len && /\s/.test(text[i])) i++;
    while (text[i] === ')') {
      close++;
      i++;
      while (i < len && /\s/.test(text[i])) i++;
    }
    res.push({ expr: expr.trim(), connector, open, close });
    while (i < len && /\s/.test(text[i])) i++;
    if (text.slice(i).toUpperCase().startsWith('AND')) {
      connector = 'AND';
      i += 3;
    } else if (text.slice(i).toUpperCase().startsWith('OR')) {
      connector = 'OR';
      i += 2;
    } else {
      connector = undefined;
      break;
    }
  }
  return res;
}

function splitByComma(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== '\\') quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ')') {
      depth--;
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitTopLevel(text, regex) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const sub = text.slice(i);
    if (!quote && depth === 0) {
      const m = regex.exec(sub);
      if (m && m.index === 0) {
        parts.push(current.trim());
        current = '';
        i += m[0].length - 1;
        continue;
      }
    }
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== '\\') quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ')') {
      depth--;
      current += ch;
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findClause(text, clause) {
  const re = new RegExp(`\\b${clause.replace(/\s+/g, '\\s+')}\\b`, 'i');
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      if (depth > 0) depth--;
      continue;
    }
    if (depth === 0) {
      const sub = text.slice(i);
      const m = re.exec(sub);
      if (m && m.index === 0) return { index: i, length: m[0].length };
    }
  }
  return { index: -1, length: 0 };
}

function strip(str = '') {
  return str.replace(/^[`"']|[`"']$/g, '');
}


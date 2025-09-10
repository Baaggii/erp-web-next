/**
 * Parse a stored procedure SQL for an embedded REPORT_BUILDER_CONFIG block.
 * If absent, attempt to convert the SELECT/FROM/JOIN/WHERE/GROUP BY clauses
 * into a report builder configuration structure.
 *
 * @param {string} sql
 * @returns {{config: object, converted: boolean}|null}
 */
export default function parseProcedureConfig(sql = '') {
  if (!sql) return { error: 'No SQL provided' };

  const match = sql.match(/\/\*REPORT_BUILDER_CONFIG\s*([\s\S]*?)\*\//i);
  if (match) {
    try {
      return { config: JSON.parse(match[1]), converted: false };
    } catch (err) {
      throw new Error('Invalid REPORT_BUILDER_CONFIG JSON');
    }
  }

  const result = convertSql(sql);
  if (result) return { config: result.config, converted: true, partial: result.partial };
  return { error: 'REPORT_BUILDER_CONFIG not found' };
}

function convertSql(sql) {
  // Attempt to extract procedure name
  const nameMatch = sql.match(/PROCEDURE\s+`?([^\s`(]+)`?/i);
  const procName = nameMatch ? nameMatch[1] : '';

  // Extract body inside BEGIN..END and strip comments
  const bodyMatch = sql.match(/BEGIN\s+([\s\S]*)END\s*$/i);
  let body = bodyMatch ? bodyMatch[1] : sql;
  body = body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .replace(/#.*$/gm, ' ')
    .trim();

  const selIdx = body.toUpperCase().indexOf('SELECT');
  if (selIdx === -1) return null;
  let statement = body.slice(selIdx);
  statement = statement.split(';')[0];
  const selectMatch = statement.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+)/i);
  if (!selectMatch) return null;
  const selectPart = selectMatch[1].trim();
  const rest = selectMatch[2];

  const upperRest = rest.toUpperCase();
  const whereIdx = upperRest.indexOf(' WHERE ');
  const groupIdx = upperRest.indexOf(' GROUP BY ');
  const orderIdx = upperRest.indexOf(' ORDER BY ');
  const havingIdx = upperRest.indexOf(' HAVING ');
  const limitIdx = upperRest.indexOf(' LIMIT ');

  const clauseIndices = [whereIdx, groupIdx, orderIdx, havingIdx, limitIdx].filter(
    (i) => i !== -1,
  );
  const endIdx = clauseIndices.length ? Math.min(...clauseIndices) : upperRest.length;

  const fromJoinPart = rest.slice(0, endIdx).trim();

  let wherePart = '';
  let groupPart = '';

  if (whereIdx !== -1) {
    const afterWhereCandidates = [groupIdx, orderIdx, havingIdx, limitIdx].filter(
      (i) => i !== -1 && i > whereIdx,
    );
    const whereEndIdx = afterWhereCandidates.length
      ? Math.min(...afterWhereCandidates)
      : rest.length;
    wherePart = rest.slice(whereIdx + 6, whereEndIdx).trim();
  }

  if (groupIdx !== -1) {
    const afterGroupCandidates = [orderIdx, havingIdx, limitIdx].filter(
      (i) => i !== -1 && i > groupIdx,
    );
    const groupEndIdx = afterGroupCandidates.length
      ? Math.min(...afterGroupCandidates)
      : rest.length;
    groupPart = rest.slice(groupIdx + 9, groupEndIdx).trim();
  }

  const {
    fromTable,
    fromAlias,
    joins,
    aliasMap,
    partial: fromPartial,
  } = parseFromAndJoins(fromJoinPart);
  if (!fromTable) return null;

  let partial = !!fromPartial;

  const fields = parseFields(selectPart, aliasMap);
  let whereRes;
  try {
    whereRes = parseWhere(wherePart, fromAlias, joins, aliasMap);
  } catch {
    partial = true;
    whereRes = { fromFilters: [], partial: true };
  }
  const { fromFilters, partial: wherePartial } = whereRes;
  if (wherePartial) partial = true;

  let groupRes;
  try {
    groupRes = parseGroupBy(groupPart, aliasMap);
  } catch {
    partial = true;
    groupRes = { groups: [], partial: true };
  }
  const { groups, partial: groupPartial } = groupRes;
  if (groupPartial) partial = true;

  return {
    config: {
      procName,
      fromTable,
      joins,
      fields,
      groups,
      fromFilters,
      conditions: [],
      unionQueries: [],
    },
    partial,
  };
}

function parseFromAndJoins(text) {
  const aliasMap = {};
  let remaining = text.trim();
  let partial = false;

  let fromTable = '';
  let fromAlias = '';

  if (/^\(/.test(remaining)) {
    let depth = 0;
    let i = 0;
    for (; i < remaining.length; i++) {
      const ch = remaining[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const after = remaining.slice(i + 1).trim();
    const aliasMatch = after.match(/^(?:AS\s+)?([`"\w]+)/i);
    if (!aliasMatch) {
      return { fromTable: '', fromAlias: '', joins: [], aliasMap, partial: true };
    }
    fromTable = aliasMatch[1].replace(/[`"]/g, '');
    fromAlias = fromTable;
    aliasMap[fromAlias] = fromTable;
    remaining = after.slice(aliasMatch[0].length).trim();
  } else {
    const fromMatch = remaining.match(/^([`"\w\.]+)(?:\s+(?:AS\s+)?([`"\w]+))?/i);
    if (!fromMatch)
      return { fromTable: '', fromAlias: '', joins: [], aliasMap, partial: true };
    fromTable = fromMatch[1].replace(/[`"]/g, '');
    fromAlias = fromMatch[2];
    if (!fromAlias || /(LEFT|RIGHT|INNER|FULL|OUTER|CROSS|JOIN)/i.test(fromAlias)) {
      fromAlias = fromTable;
    }
    aliasMap[fromAlias] = fromTable;
    remaining = remaining.slice(fromMatch[0].length).trim();
  }

  const joins = [];
  let lastAlias = fromAlias;
  const joinRe = /(LEFT|RIGHT|INNER|FULL|OUTER|CROSS)?\s*JOIN\s+([`"\w\.]+)(?:\s+(?:AS\s+)?([`"\w]+))?\s+(ON|USING)\s+([^]*?)(?=(LEFT|RIGHT|INNER|FULL|OUTER|CROSS)?\s*JOIN|$)/gi;
  let jm;
  while ((jm = joinRe.exec(remaining))) {
    const type = jm[1] ? `${jm[1].trim()} JOIN` : 'JOIN';
    const table = jm[2].replace(/[`"]/g, '');
    let alias = jm[3];
    if (!alias || /(LEFT|RIGHT|INNER|FULL|OUTER|CROSS|JOIN)/i.test(alias)) {
      alias = table;
    }
    aliasMap[alias] = table;
    let conditions = [];
    if (jm[4].toUpperCase() === 'ON') {
      conditions = parseJoinConditions(jm[5].trim(), alias, aliasMap);
    } else {
      conditions = parseUsingColumns(jm[5].trim(), lastAlias);
    }
    if (conditions.length === 0) partial = true;
    const targetAlias = conditions[0]?.targetAlias || fromAlias;
    conditions.forEach((c) => delete c.targetAlias);
    joins.push({
      table,
      alias,
      type,
      targetTable: aliasMap[targetAlias] || targetAlias,
      conditions,
      filters: [],
    });
    lastAlias = alias;
  }

  if (remaining.slice(joinRe.lastIndex).trim()) partial = true;

  return { fromTable, fromAlias, joins, aliasMap, partial };
}

function parseJoinConditions(text, joinAlias, aliasMap) {
  const parts = text.split(/\s+AND\s+/i);
  const conds = [];
  parts.forEach((p, idx) => {
    const m = p.trim().match(/([`"\w]+)\.([`"\w]+)\s*=\s*([`"\w]+)\.([`"\w]+)/);
    if (!m) return;
    const [_, a1, f1, a2, f2] = m.map((s) => s.replace(/[`"]/g, ''));
    let fromAlias = a1;
    let fromField = f1;
    let toField = f2;
    if (a1 === joinAlias) {
      fromAlias = a2;
      fromField = f2;
      toField = f1;
    } else if (a2 !== joinAlias) {
      // neither side is join alias; default
      fromAlias = a1;
      fromField = f1;
      toField = f2;
    }
    conds.push({
      fromField,
      toField,
      connector: idx > 0 ? 'AND' : undefined,
      targetAlias: fromAlias,
    });
  });
  return conds;
}

function parseUsingColumns(text, baseAlias) {
  const cols = text
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return cols.map((col, idx) => ({
    fromField: col.replace(/[`"]/g, ''),
    toField: col.replace(/[`"]/g, ''),
    connector: idx > 0 ? 'AND' : undefined,
    targetAlias: baseAlias,
  }));
}

function parseFields(text, aliasMap) {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      let expr = item;
      let alias = '';
      const asMatch = item.match(/(.+?)\s+AS\s+([\w`"]+)/i);
      if (asMatch) {
        expr = asMatch[1];
        alias = asMatch[2].replace(/[`"]/g, '');
      } else {
        const aliasMatch = item.match(/(.+?)\s+([\w`"]+)$/);
        if (aliasMatch && !/\./.test(aliasMatch[2])) {
          expr = aliasMatch[1];
          alias = aliasMatch[2].replace(/[`"]/g, '');
        }
      }

      const aggMatch = expr.match(/^(SUM|COUNT|MAX|MIN)\s*\(\s*([`"\w]+)\.([`"\w]+)\s*\)/i);
      if (aggMatch) {
        return {
          source: 'field',
          table: aliasMap[aggMatch[2].replace(/[`"]/g, '')] || aggMatch[2].replace(/[`"]/g, ''),
          field: aggMatch[3].replace(/[`"]/g, ''),
          alias,
          aggregate: aggMatch[1].toUpperCase(),
          baseAlias: '',
          calcParts: [],
          conditions: [],
        };
      }

      const fieldMatch = expr.match(/([`"\w]+)\.([`"\w]+)/);
      if (!fieldMatch) return null;
      return {
        source: 'field',
        table: aliasMap[fieldMatch[1].replace(/[`"]/g, '')] || fieldMatch[1].replace(/[`"]/g, ''),
        field: fieldMatch[2].replace(/[`"]/g, ''),
        alias,
        aggregate: 'NONE',
        baseAlias: '',
        calcParts: [],
        conditions: [],
      };
    })
    .filter(Boolean);
}

function parseWhere(text, baseAlias, joins, aliasMap) {
  const fromFilters = [];
  let partial = false;
  if (!text) return { fromFilters, partial };
  const parts = text.split(/\s+AND\s+/i);
  parts.forEach((p) => {
    const m = p.trim().match(/([`"\w]+)\.([`"\w]+)\s*(=|<>|>=|<=|>|<)\s*(.+)/);
    if (!m) {
      partial = true;
      return;
    }
    const alias = m[1].replace(/[`"]/g, '');
    const field = m[2].replace(/[`"]/g, '');
    const operator = m[3];
    let value = m[4].trim();
    let valueType = 'value';
    const filter = { field, operator, connector: 'AND', open: 0, close: 0 };
    if (/^:[\w]+/.test(value)) {
      valueType = 'param';
      filter.param = value.slice(1);
    } else {
      value = value.replace(/^['"]|['"]$/g, '');
      filter.value = value;
    }
    filter.valueType = valueType;

    if (alias === baseAlias || aliasMap[alias] === aliasMap[baseAlias]) {
      fromFilters.push(filter);
    } else {
      const j = joins.find((jn) => jn.alias === alias);
      if (j) j.filters.push(filter);
    }
  });
  return { fromFilters, partial };
}

function parseGroupBy(text, aliasMap) {
  if (!text) return { groups: [], partial: false };
  const parts = text.split(',');
  const groups = [];
  let partial = false;
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((seg) => {
      const m = seg.match(/([`"\w]+)\.([`"\w]+)/);
      if (!m) {
        partial = true;
        return;
      }
      groups.push({
        table:
          aliasMap[m[1].replace(/[`"]/g, '')] ||
          m[1].replace(/[`"]/g, ''),
        field: m[2].replace(/[`"]/g, ''),
      });
    });
  return { groups, partial };
}


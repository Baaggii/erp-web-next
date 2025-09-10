/**
 * Parse a stored procedure SQL for an embedded REPORT_BUILDER_CONFIG block.
 * If absent, attempt to convert the SELECT/FROM/JOIN/WHERE/GROUP BY clauses
 * into a report builder configuration structure.
 *
 * @param {string} sql
 * @returns {{config: object, converted: boolean}|null}
 */
export default function parseProcedureConfig(sql = '') {
  if (!sql) return null;

  const match = sql.match(/\/\*REPORT_BUILDER_CONFIG\s*([\s\S]*?)\*\//i);
  if (match) {
    try {
      return { config: JSON.parse(match[1]), converted: false };
    } catch (err) {
      throw new Error('Invalid REPORT_BUILDER_CONFIG JSON');
    }
  }

  const config = convertSql(sql);
  return config ? { config, converted: true } : null;
}

function convertSql(sql) {
  // Attempt to extract procedure name
  const nameMatch = sql.match(/PROCEDURE\s+`?([^\s`(]+)`?/i);
  const procName = nameMatch ? nameMatch[1] : '';

  // Extract body inside BEGIN..END and strip comments
  const bodyMatch = sql.match(/BEGIN\s+([\s\S]*?)END/i);
  let body = bodyMatch ? bodyMatch[1] : sql;
  body = body.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();

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
  const endIdx = Math.min(
    whereIdx !== -1 ? whereIdx : upperRest.length,
    groupIdx !== -1 ? groupIdx : upperRest.length,
  );

  const fromJoinPart = rest.slice(0, endIdx).trim();

  let wherePart = '';
  let groupPart = '';
  if (whereIdx !== -1) {
    if (groupIdx !== -1 && groupIdx > whereIdx) {
      wherePart = rest.slice(whereIdx + 6, groupIdx).trim();
    } else {
      wherePart = rest.slice(whereIdx + 6).trim();
    }
  }
  if (groupIdx !== -1) {
    groupPart = rest.slice(groupIdx + 9).trim();
  }

  const { fromTable, fromAlias, joins, aliasMap } = parseFromAndJoins(fromJoinPart);
  if (!fromTable) return null;

  const fields = parseFields(selectPart, aliasMap);
  const { fromFilters } = parseWhere(wherePart, fromAlias, joins, aliasMap);
  const groups = parseGroupBy(groupPart, aliasMap);

  return {
    procName,
    fromTable,
    joins,
    fields,
    groups,
    fromFilters,
    conditions: [],
    unionQueries: [],
  };
}

function parseFromAndJoins(text) {
  const aliasMap = {};
  let remaining = text.trim();

  const fromMatch = remaining.match(/^([`"\w\.]+)(?:\s+([`"\w]+))?/);
  if (!fromMatch) return { fromTable: '', fromAlias: '', joins: [], aliasMap };
  let fromTable = fromMatch[1].replace(/[`"]/g, '');
  let fromAlias = fromMatch[2];
  if (!fromAlias || /(LEFT|RIGHT|INNER|FULL|OUTER|CROSS|JOIN)/i.test(fromAlias)) {
    fromAlias = fromTable;
  }
  aliasMap[fromAlias] = fromTable;
  remaining = remaining.slice(fromMatch[0].length).trim();

  const joins = [];
  const joinRe = /(LEFT|RIGHT|INNER|FULL|OUTER|CROSS)?\s*JOIN\s+([`"\w\.]+)(?:\s+([`"\w]+))?\s+ON\s+([^]*?)(?=(LEFT|RIGHT|INNER|FULL|OUTER|CROSS)?\s*JOIN|$)/gi;
  let jm;
  while ((jm = joinRe.exec(remaining))) {
    const type = jm[1] ? `${jm[1].trim()} JOIN` : 'JOIN';
    const table = jm[2].replace(/[`"]/g, '');
    let alias = jm[3];
    if (!alias || /(LEFT|RIGHT|INNER|FULL|OUTER|CROSS|JOIN)/i.test(alias)) {
      alias = table;
    }
    aliasMap[alias] = table;
    const conditions = parseJoinConditions(jm[4].trim(), alias, aliasMap);
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
  }

  return { fromTable, fromAlias, joins, aliasMap };
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
  if (!text) return { fromFilters };
  const parts = text.split(/\s+AND\s+/i);
  parts.forEach((p) => {
    const m = p.trim().match(/([`"\w]+)\.([`"\w]+)\s*(=|<>|>=|<=|>|<)\s*(.+)/);
    if (!m) return;
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
  return { fromFilters };
}

function parseGroupBy(text, aliasMap) {
  if (!text) return [];
  return text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/([`"\w]+)\.([`"\w]+)/);
      if (!m) return null;
      return {
        table: aliasMap[m[1].replace(/[`"]/g, '')] || m[1].replace(/[`"]/g, ''),
        field: m[2].replace(/[`"]/g, ''),
      };
    })
    .filter(Boolean);
}


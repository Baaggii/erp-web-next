import { getProcedureDefinitionSql, listTableRelationships } from '../../db/index.js';
import { listCustomRelations } from '../services/tableRelationsConfig.js';
import { getDisplayFields } from '../services/displayFieldConfig.js';

function normalizeIdent(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[`"]/g, '').trim();
}

function stripSchema(tableName) {
  const normalized = normalizeIdent(tableName);
  if (!normalized) return '';
  const parts = normalized.split('.');
  return parts[parts.length - 1];
}

function extractProcedureBody(sql) {
  if (!sql) return '';
  const match = sql.match(/BEGIN\s*([\s\S]*)END/i);
  return match ? match[1] : sql;
}

function findTopLevelIndex(sql, keyword) {
  const upper = sql.toUpperCase();
  const target = keyword.toUpperCase();
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    if (inSingle) {
      if (ch === "'" && upper[i - 1] !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && upper[i - 1] !== '\\') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && upper.startsWith(target, i)) {
      return i;
    }
  }
  return -1;
}

function findTopLevelChar(sql, char) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inSingle) {
      if (ch === "'" && sql[i - 1] !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && sql[i - 1] !== '\\') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === char) return i;
  }
  return -1;
}

function findTopLevelEnd(sql, startIdx) {
  const endings = ['WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'UNION'];
  let endIdx = sql.length;
  endings.forEach((keyword) => {
    const idx = findTopLevelIndex(sql.slice(startIdx), keyword);
    if (idx !== -1) {
      endIdx = Math.min(endIdx, startIdx + idx);
    }
  });
  return endIdx;
}

function splitTopLevel(input) {
  const items = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let buf = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inSingle) {
      buf += ch;
      if (ch === "'" && input[i - 1] !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '"' && input[i - 1] !== '\\') inDouble = false;
      continue;
    }
    if (inBacktick) {
      buf += ch;
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      buf += ch;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      buf += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (buf.trim()) items.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) items.push(buf.trim());
  return items;
}

function extractSelectSql(sql) {
  const body = extractProcedureBody(sql);
  const selectIdx = findTopLevelIndex(body, 'SELECT');
  if (selectIdx === -1) return '';
  let selectSql = body.slice(selectIdx);
  const semicolonIdx = findTopLevelChar(selectSql, ';');
  if (semicolonIdx !== -1) {
    selectSql = selectSql.slice(0, semicolonIdx);
  }
  return selectSql.trim();
}

function parseSelectItems(selectSql) {
  if (!selectSql) return [];
  const fromIdx = findTopLevelIndex(selectSql, 'FROM');
  if (fromIdx === -1) return [];
  const selectList = selectSql.slice(6, fromIdx);
  return splitTopLevel(selectList);
}

function parseAliasMap(selectSql) {
  const aliasMap = {};
  if (!selectSql) return aliasMap;
  const fromIdx = findTopLevelIndex(selectSql, 'FROM');
  if (fromIdx === -1) return aliasMap;
  const endIdx = findTopLevelEnd(selectSql, fromIdx);
  const fromClause = selectSql.slice(fromIdx, endIdx);
  const regex = /\b(?:FROM|JOIN)\s+([`"a-zA-Z0-9_.]+|\([^)]*\))\s*(?:AS\s+)?([`"a-zA-Z0-9_]+)?/gi;
  let match;
  while ((match = regex.exec(fromClause)) !== null) {
    const tableToken = match[1];
    if (!tableToken || tableToken.trim().startsWith('(')) continue;
    const table = stripSchema(tableToken);
    if (!table) continue;
    const alias = normalizeIdent(match[2]) || table;
    if (!aliasMap[alias]) aliasMap[alias] = table;
  }
  return aliasMap;
}

function parseSelectAlias(item) {
  if (!item) return { expr: '', alias: '' };
  const aliasMatch = item.match(/^(.*)\s+AS\s+(`?[a-zA-Z0-9_]+`?)$/i);
  if (aliasMatch) {
    return { expr: aliasMatch[1].trim(), alias: normalizeIdent(aliasMatch[2]) };
  }
  const trailingMatch = item.match(/^(.*)\s+(`?[a-zA-Z0-9_]+`?)$/);
  if (trailingMatch) {
    const expr = trailingMatch[1].trim();
    const token = trailingMatch[2].trim();
    const exprHasSpace = /\s/.test(expr);
    const exprHasParen = expr.includes('(') || /CASE\s+/i.test(expr);
    if (exprHasSpace || exprHasParen) {
      return { expr, alias: normalizeIdent(token) };
    }
  }
  return { expr: item.trim(), alias: '' };
}

function parseColumnReference(expr) {
  if (!expr) return null;
  const cleaned = expr.trim().replace(/\s+/g, ' ');
  if (!/^[`"a-zA-Z0-9_.]+$/.test(cleaned)) return null;
  const normalized = normalizeIdent(cleaned);
  if (!normalized) return null;
  const parts = normalized.split('.');
  if (parts.length === 2) {
    return { alias: parts[0], column: parts[1] };
  }
  if (parts.length === 1) {
    return { alias: '', column: parts[0] };
  }
  return null;
}

function unwrapParens(expr) {
  let value = expr.trim();
  while (value.startsWith('(') && value.endsWith(')')) {
    let depth = 0;
    let isWrapped = true;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && i < value.length - 1) {
        isWrapped = false;
        break;
      }
    }
    if (!isWrapped) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function extractColumnFromCast(expr) {
  const upper = expr.toUpperCase();
  const asIdx = upper.indexOf(' AS ');
  const inner = asIdx === -1 ? expr : expr.slice(0, asIdx);
  return inner.trim();
}

function extractFirstArg(expr) {
  const parts = splitTopLevel(expr);
  return parts.length ? parts[0] : expr;
}

function extractColumnReference(expr) {
  if (!expr) return null;
  const trimmed = unwrapParens(expr);
  if (/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(trimmed)) return null;
  const distinctMatch = trimmed.match(/^DISTINCT\s+(.+)$/i);
  const distinctExpr = distinctMatch ? distinctMatch[1].trim() : trimmed;
  const direct = parseColumnReference(distinctExpr);
  if (direct) return direct;

  const funcMatch = distinctExpr.match(/^([a-zA-Z0-9_]+)\s*\(([\s\S]*)\)$/);
  if (!funcMatch) return null;
  const funcName = funcMatch[1].toUpperCase();
  let inner = funcMatch[2] || '';
  inner = unwrapParens(inner);
  if (!inner) return null;
  if (funcName === 'CAST' || funcName === 'CONVERT') {
    const castExpr = extractColumnFromCast(inner);
    return extractColumnReference(castExpr);
  }
  const firstArg = extractFirstArg(inner);
  return extractColumnReference(firstArg);
}

async function resolveRelationInfo(table, column, companyId, relationCache) {
  if (!table || !column) return null;
  const cacheKey = table.toLowerCase();
  if (!relationCache.has(cacheKey)) {
    const [dbRelations, customRelations] = await Promise.all([
      listTableRelationships(table),
      listCustomRelations(table, companyId),
    ]);
    relationCache.set(cacheKey, {
      dbRelations: Array.isArray(dbRelations) ? dbRelations : [],
      customRelations: customRelations?.config || {},
    });
  }
  const { dbRelations, customRelations } = relationCache.get(cacheKey);
  const lowerColumn = column.toLowerCase();
  let relation = null;

  for (const [key, entries] of Object.entries(customRelations || {})) {
    if (key && key.toLowerCase() === lowerColumn && Array.isArray(entries) && entries[0]) {
      relation = entries[0];
      break;
    }
  }

  if (!relation) {
    relation = dbRelations.find(
      (rel) =>
        rel?.COLUMN_NAME && String(rel.COLUMN_NAME).toLowerCase() === lowerColumn,
    );
    if (relation) {
      relation = {
        table: relation.REFERENCED_TABLE_NAME,
        column: relation.REFERENCED_COLUMN_NAME,
      };
    }
  }

  if (!relation || !relation.table) return null;
  const displayCfg = await getDisplayFields(relation.table, companyId, {
    filterColumn: relation.filterColumn,
    filterValue: relation.filterValue,
    idField: relation.idField,
    targetColumn: relation.column,
  });
  const displayField =
    displayCfg?.config?.displayFields?.[0] ||
    displayCfg?.config?.idField ||
    relation.column ||
    null;
  if (!displayField) return null;
  return {
    targetTable: relation.table,
    displayField,
  };
}

export async function buildReportFieldLineage(procedureName, companyId = 0) {
  if (!procedureName) return {};
  try {
    const rawSql = await getProcedureDefinitionSql(procedureName);
    if (!rawSql) return {};
    const selectSql = extractSelectSql(rawSql);
    if (!selectSql) return {};
    const selectItems = parseSelectItems(selectSql);
    if (!selectItems.length) return {};
    const aliasMap = parseAliasMap(selectSql);
    const primaryTable = Object.values(aliasMap)[0] || '';
    const relationCache = new Map();
    const lineage = {};

    for (const item of selectItems) {
      const { expr, alias } = parseSelectAlias(item);
      const columnRef = extractColumnReference(expr);
      const outputField =
        alias ||
        (columnRef && columnRef.column ? columnRef.column : expr);
      if (!outputField) continue;
      const entry = { expr };
      if (columnRef) {
        const sourceTable = columnRef.alias
          ? aliasMap[columnRef.alias] || columnRef.alias
          : primaryTable;
        if (sourceTable) {
          entry.sourceTable = sourceTable;
          entry.sourceColumn = columnRef.column;
          const relation = await resolveRelationInfo(
            sourceTable,
            columnRef.column,
            companyId,
            relationCache,
          );
          if (relation) entry.relation = relation;
        }
      }
      lineage[outputField] = entry;
    }
    return lineage;
  } catch {
    return {};
  }
}

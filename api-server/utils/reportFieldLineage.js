import {
  getProcedureDefinitionSql,
  listTableColumnsDetailed,
  listTableRelationships,
} from '../../db/index.js';
import { listCustomRelations } from '../services/tableRelationsConfig.js';
import { getDisplayFields } from '../services/displayFieldConfig.js';
import { getMappings } from '../services/headerMappings.js';

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
  const semicolonIdx = findTopLevelIndex(selectSql, ';');
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
    const exprIsSimpleIdent =
      /^[`"]?[a-zA-Z_][\w]*[`"]?(?:\s*\.\s*[`"]?[a-zA-Z_][\w]*[`"]?)*$/.test(expr);
    const exprEndsWithOperator = /[+\-*/%]$/.test(expr);
    const exprEndsWithLogical = /\b(AND|OR|NOT|IN|LIKE|IS|BETWEEN)$/i.test(expr);
    const aliasToken = normalizeIdent(token);
    const exprEndsWithEnd = /\bEND\s*$/i.test(expr);
    const aliasIsCaseEnd =
      /CASE\s+/i.test(expr) && aliasToken.toUpperCase() === 'END' && !exprEndsWithEnd;
    if (
      (exprHasSpace || exprHasParen || exprIsSimpleIdent) &&
      !exprEndsWithOperator &&
      !exprEndsWithLogical &&
      !aliasIsCaseEnd
    ) {
      return { expr, alias: aliasToken };
    }
  }
  return { expr: item.trim(), alias: '' };
}

function parseWithClause(selectSql) {
  const trimmed = selectSql.trim();
  if (!/^WITH\b/i.test(trimmed)) return [];
  const mainSelectIdx = findTopLevelIndex(trimmed, 'SELECT');
  if (mainSelectIdx === -1) return [];
  const withClause = trimmed.slice(0, mainSelectIdx).trim();
  const clauseBody = withClause
    .replace(/^WITH\s+RECURSIVE\s+/i, '')
    .replace(/^WITH\s+/i, '')
    .trim();
  if (!clauseBody) return [];
  return splitTopLevel(clauseBody);
}

function parseCteDefinition(item) {
  const match = item.match(
    /^\s*([`"a-zA-Z0-9_]+)(?:\s*\(([^)]*)\))?\s+AS\s*\(([\s\S]*)\)\s*$/i,
  );
  if (!match) return null;
  const name = normalizeIdent(match[1]);
  const columnListRaw = match[2];
  const innerSql = match[3]?.trim() || '';
  const columns = columnListRaw
    ? splitTopLevel(columnListRaw).map((col) => normalizeIdent(col))
    : [];
  return { name, columns, innerSql };
}

function resolveColumnRef(expr) {
  const unwrapped = unwrapSimpleFunction(expr);
  let columnRef = parseColumnReference(unwrapped);
  if (!columnRef) {
    const fallback = extractFirstColumn(expr) || extractFirstColumn(unwrapped);
    if (fallback) {
      columnRef = parseColumnReference(fallback);
    }
  }
  return { columnRef, unwrapped };
}

function buildCteLineage(selectSql) {
  const cteItems = parseWithClause(selectSql);
  if (!cteItems.length) return new Map();
  const cteLineage = new Map();
  cteItems.forEach((item) => {
    const def = parseCteDefinition(item);
    if (!def?.name || !def.innerSql) return;
    const selectItems = parseSelectItems(def.innerSql);
    if (!selectItems.length) return;
    const aliasMap = parseAliasMap(def.innerSql);
    const primaryTable = Object.values(aliasMap)[0] || '';
    const columnMap = new Map();
    selectItems.forEach((selectItem, index) => {
      const { expr, alias } = parseSelectAlias(selectItem);
      const outputField = def.columns[index] || alias;
      if (!outputField) return;
      const { columnRef } = resolveColumnRef(expr);
      if (!columnRef) return;
      const sourceTable = columnRef.alias
        ? aliasMap[columnRef.alias] || columnRef.alias
        : primaryTable;
      if (!sourceTable) return;
      columnMap.set(String(outputField).toLowerCase(), {
        sourceTable,
        sourceColumn: columnRef.column,
      });
    });
    if (columnMap.size) {
      cteLineage.set(String(def.name).toLowerCase(), columnMap);
    }
  });
  return cteLineage;
}

function findTopLevelWord(input, word) {
  if (!input) return -1;
  const upper = input.toUpperCase();
  const target = word.toUpperCase();
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
    if (depth !== 0) continue;
    if (upper.startsWith(target, i)) {
      const before = upper[i - 1];
      const after = upper[i + target.length];
      const beforeOk = !before || /[^A-Z0-9_]/.test(before);
      const afterOk = !after || /[^A-Z0-9_]/.test(after);
      if (beforeOk && afterOk) return i;
    }
  }
  return -1;
}

function unwrapOnce(expr) {
  if (!expr) return '';
  const trimmed = expr.trim();
  const match = trimmed.match(/^([a-zA-Z_][\w]*)\s*\(([\s\S]*)\)$/);
  if (!match) return trimmed;
  const fn = match[1].toUpperCase();
  const inner = match[2].trim();
  if (['MAX', 'MIN', 'SUM', 'AVG', 'DATE'].includes(fn)) {
    return inner;
  }
  if (['IFNULL', 'COALESCE'].includes(fn)) {
    const args = splitTopLevel(inner);
    return args[0] ? args[0].trim() : inner;
  }
  if (fn === 'CAST') {
    const asIndex = findTopLevelWord(inner, 'AS');
    if (asIndex !== -1) {
      return inner.slice(0, asIndex).trim();
    }
    return inner;
  }
  return trimmed;
}

function unwrapSimpleFunction(expr) {
  if (!expr) return '';
  let current = expr.trim();
  let next = unwrapOnce(current);
  while (next && next !== current) {
    current = next;
    next = unwrapOnce(current);
  }
  return current;
}

function extractFirstColumn(expr) {
  if (!expr) return null;
  const match = expr.match(
    /([`"]?[a-zA-Z_][\w]*[`"]?)\s*\.\s*([`"]?[a-zA-Z_][\w]*[`"]?)/,
  );
  if (!match) return null;
  return `${match[1]}.${match[2]}`.replace(/\s+/g, '');
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

function classifyExpressionKind(expr, columnRef) {
  if (!expr) return 'computed';
  const trimmed = expr.trim();
  if (/(?:MAX|MIN|SUM|AVG)\s*\(/i.test(trimmed)) return 'aggregated';
  if (columnRef) {
    const ref = columnRef.alias ? `${columnRef.alias}.${columnRef.column}` : columnRef.column;
    if (normalizeIdent(ref) === normalizeIdent(trimmed)) return 'direct';
  }
  return 'computed';
}

async function resolveEnumInfo(table, column, companyId, columnCache, mappingCache) {
  if (!table || !column) return null;
  const cacheKey = table.toLowerCase();
  if (!columnCache.has(cacheKey)) {
    const columns = await listTableColumnsDetailed(table);
    columnCache.set(cacheKey, Array.isArray(columns) ? columns : []);
  }
  const columns = columnCache.get(cacheKey);
  const lowerColumn = column.toLowerCase();
  const columnInfo = columns.find(
    (entry) => entry?.name && String(entry.name).toLowerCase() === lowerColumn,
  );
  if (!columnInfo || !Array.isArray(columnInfo.enumValues) || !columnInfo.enumValues.length) {
    return null;
  }
  const key = `${companyId}|${columnInfo.enumValues.join('|')}`;
  let labels = mappingCache.get(key);
  if (!labels) {
    labels = await getMappings(columnInfo.enumValues, null, companyId);
    mappingCache.set(key, labels);
  }
  return { values: columnInfo.enumValues, labels };
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
    const cteLineage = buildCteLineage(selectSql);
    const primaryTable = Object.values(aliasMap)[0] || '';
    const relationCache = new Map();
    const columnCache = new Map();
    const enumLabelCache = new Map();
    const lineage = {};

    for (const item of selectItems) {
      const { expr, alias } = parseSelectAlias(item);
      const { columnRef } = resolveColumnRef(expr);
      const outputField =
        alias ||
        (columnRef && columnRef.column ? columnRef.column : expr);
      if (!outputField) continue;
      const entry = { expr, kind: classifyExpressionKind(expr, columnRef) };
      if (columnRef) {
        let sourceTable = columnRef.alias
          ? aliasMap[columnRef.alias] || columnRef.alias
          : primaryTable;
        let sourceColumn = columnRef.column;
        const cteColumns = sourceTable
          ? cteLineage.get(String(sourceTable).toLowerCase())
          : null;
        if (cteColumns) {
          const mapped = cteColumns.get(String(sourceColumn).toLowerCase());
          if (mapped?.sourceTable && mapped?.sourceColumn) {
            sourceTable = mapped.sourceTable;
            sourceColumn = mapped.sourceColumn;
          }
        }
        if (sourceTable) {
          entry.sourceTable = sourceTable;
          entry.sourceColumn = sourceColumn;
          const relation = await resolveRelationInfo(
            sourceTable,
            sourceColumn,
            companyId,
            relationCache,
          );
          if (relation) entry.relation = relation;
          const enumInfo = await resolveEnumInfo(
            sourceTable,
            sourceColumn,
            companyId,
            columnCache,
            enumLabelCache,
          );
          if (enumInfo) entry.enum = enumInfo;
        }
      }
      lineage[outputField] = entry;
    }
    return lineage;
  } catch {
    return {};
  }
}

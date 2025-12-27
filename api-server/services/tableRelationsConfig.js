import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

const FILE_NAME = 'tableRelations.json';

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(FILE_NAME, companyId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { cfg: data, isDefault };
    }
  } catch {}
  return { cfg: {}, isDefault };
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath(FILE_NAME, companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function normalizeRelation(relation = {}) {
  const targetTable = relation.table ?? relation.targetTable;
  const targetColumn = relation.column ?? relation.targetColumn;
  const idField = relation.idField ?? relation.id_field;
  const displayFields = relation.displayFields ?? relation.display_fields;
  const combinationSource =
    relation.combinationSourceColumn ?? relation.combination_source_column;
  const combinationTarget =
    relation.combinationTargetColumn ?? relation.combination_target_column;
  const filterColumn = relation.filterColumn ?? relation.filter_column;
  const filterValue = relation.filterValue ?? relation.filter_value;
  const isArray =
    relation.isArray ??
    relation.jsonField ??
    relation.is_array ??
    relation.json_field ??
    false;

  const tableStr = typeof targetTable === 'string' ? targetTable.trim() : '';
  const columnStr = typeof targetColumn === 'string' ? targetColumn.trim() : '';
  if (!tableStr) {
    throw new Error('targetTable is required');
  }
  if (!columnStr) {
    throw new Error('targetColumn is required');
  }

  const normalized = { table: tableStr, column: columnStr };
  if (typeof isArray === 'boolean') {
    normalized.isArray = isArray;
  } else if (typeof isArray === 'string') {
    normalized.isArray = isArray.toLowerCase() === 'true';
  }
  if (typeof idField === 'string' && idField.trim()) {
    normalized.idField = idField.trim();
  }
  if (Array.isArray(displayFields)) {
    normalized.displayFields = displayFields.map((f) => String(f));
  }
  const sourceStr =
    typeof combinationSource === 'string' ? combinationSource.trim() : '';
  const targetStr =
    typeof combinationTarget === 'string' ? combinationTarget.trim() : '';
  const filterColumnStr =
    typeof filterColumn === 'string' ? filterColumn.trim() : '';
  const filterValueStr =
    filterValue === null || filterValue === undefined
      ? ''
      : String(filterValue).trim();
  if (sourceStr && targetStr) {
    normalized.combinationSourceColumn = sourceStr;
    normalized.combinationTargetColumn = targetStr;
  }
  if (filterColumnStr && filterValueStr) {
    normalized.filterColumn = filterColumnStr;
    normalized.filterValue = filterValueStr;
  }
  return normalized;
}

function tryNormalizeRelation(relation) {
  try {
    return normalizeRelation(relation);
  } catch {
    return null;
  }
}

function toRelationArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => tryNormalizeRelation(item))
      .filter((item) => item);
  }
  const normalized = tryNormalizeRelation(value);
  return normalized ? [normalized] : [];
}

function ensureRelationArray(cfg, table, column) {
  if (!cfg[table]) cfg[table] = {};
  const current = cfg[table][column];
  if (Array.isArray(current)) {
    return current;
  }
  const normalized = toRelationArray(current);
  cfg[table][column] = normalized;
  return cfg[table][column];
}

function getExistingRelationArray(cfg, table, column) {
  if (!cfg?.[table]) return null;
  const current = cfg[table][column];
  if (Array.isArray(current)) return current;
  if (current === undefined) return null;
  const normalized = toRelationArray(current);
  cfg[table][column] = normalized;
  return cfg[table][column];
}

function findRelationIndex(list, match = {}) {
  if (!Array.isArray(list)) return -1;
  const tableMatch = match.targetTable ?? match.table;
  const columnMatch = match.targetColumn ?? match.column;
  return list.findIndex((rel) => {
    if (!rel) return false;
    if (tableMatch && rel.table !== tableMatch) return false;
    if (columnMatch && rel.column !== columnMatch) return false;
    if (match.idField && rel.idField !== match.idField) return false;
    if (match.displayFields) {
      const relFields = Array.isArray(rel.displayFields) ? rel.displayFields.join('|') : '';
      const matchFields = Array.isArray(match.displayFields)
        ? match.displayFields.join('|')
        : '';
      if (relFields !== matchFields) return false;
    }
    if (
      match.combinationSourceColumn &&
      rel.combinationSourceColumn !== match.combinationSourceColumn
    ) {
      return false;
    }
    if (
      match.combinationTargetColumn &&
      rel.combinationTargetColumn !== match.combinationTargetColumn
    ) {
      return false;
    }
    if (match.filterColumn && rel.filterColumn !== match.filterColumn) {
      return false;
    }
    if (match.filterValue && rel.filterValue !== match.filterValue) {
      return false;
    }
    if (
      typeof match.isArray === 'boolean' &&
      Boolean(rel.isArray) !== Boolean(match.isArray)
    ) {
      return false;
    }
    return true;
  });
}

function cloneRelations(relations) {
  return Array.isArray(relations)
    ? relations.map((rel) => (rel ? { ...rel } : rel)).filter(Boolean)
    : [];
}

function normalizeConfig(config) {
  const normalized = {};
  if (!config || typeof config !== 'object') return normalized;
  for (const [table, columns] of Object.entries(config)) {
    if (!columns || typeof columns !== 'object') continue;
    const columnMap = {};
    for (const [column, value] of Object.entries(columns)) {
      const list = toRelationArray(value);
      if (list.length > 0) {
        columnMap[column] = cloneRelations(list);
      }
    }
    if (Object.keys(columnMap).length > 0) {
      normalized[table] = columnMap;
    }
  }
  return normalized;
}

async function writeRelation(table, column, relation, companyId = 0, options = {}) {
  if (!table) throw new Error('table is required');
  if (!column) throw new Error('column is required');
  const normalized = normalizeRelation(relation);
  const { cfg } = await readConfig(companyId);
  const list = ensureRelationArray(cfg, table, column);

  let index = -1;
  if (Number.isInteger(options.index) && options.index >= 0 && options.index < list.length) {
    index = options.index;
  } else if (options.match && typeof options.match === 'object') {
    const found = findRelationIndex(list, options.match);
    if (found >= 0) index = found;
  }

  if (index >= 0) {
    list[index] = normalized;
  } else {
    list.push(normalized);
    index = list.length - 1;
  }

  await writeConfig(cfg, companyId);
  return { relation: normalized, index, relations: cloneRelations(list) };
}

async function removeRelation(table, column, companyId = 0, options = {}) {
  const { cfg } = await readConfig(companyId);
  const list = getExistingRelationArray(cfg, table, column);
  if (!list) {
    return { removed: null, index: -1, relations: [] };
  }

  let index = -1;
  if (Number.isInteger(options.index) && options.index >= 0 && options.index < list.length) {
    index = options.index;
  } else if (options.match && typeof options.match === 'object') {
    index = findRelationIndex(list, options.match);
  }

  let removed = null;
  if (index >= 0) {
    removed = list.splice(index, 1)[0] ?? null;
  } else if (!options.index && !options.match) {
    removed = list.splice(0, list.length);
  }

  if (list.length === 0) {
    delete cfg[table][column];
    if (Object.keys(cfg[table]).length === 0) {
      delete cfg[table];
    }
  }

  if (removed !== null) {
    await writeConfig(cfg, companyId);
  }

  return {
    removed: Array.isArray(removed) ? removed.map((r) => ({ ...r })) : removed,
    index,
    relations: cloneRelations(list),
  };
}

export async function listAllCustomRelations(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: normalizeConfig(cfg), isDefault };
}

export async function listCustomRelations(table, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const normalized = normalizeConfig({ [table]: cfg?.[table] ?? {} });
  return { config: normalized[table] ?? {}, isDefault };
}

export async function saveCustomRelation(table, column, relation, companyId = 0) {
  return writeRelation(table, column, relation, companyId);
}

export async function updateCustomRelationAtIndex(
  table,
  column,
  index,
  relation,
  companyId = 0,
) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('index must be a non-negative integer');
  }
  return writeRelation(table, column, relation, companyId, { index });
}

export async function updateCustomRelationMatching(
  table,
  column,
  match,
  relation,
  companyId = 0,
) {
  if (!match || typeof match !== 'object') {
    throw new Error('match criteria is required');
  }
  return writeRelation(table, column, relation, companyId, { match });
}

export async function removeCustomRelation(table, column, companyId = 0) {
  return removeRelation(table, column, companyId);
}

export async function removeCustomRelationAtIndex(
  table,
  column,
  index,
  companyId = 0,
) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('index must be a non-negative integer');
  }
  return removeRelation(table, column, companyId, { index });
}

export async function removeCustomRelationMatching(
  table,
  column,
  match,
  companyId = 0,
) {
  if (!match || typeof match !== 'object') {
    throw new Error('match criteria is required');
  }
  return removeRelation(table, column, companyId, { match });
}

export async function removeTableCustomRelations(table, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (cfg?.[table]) {
    delete cfg[table];
    await writeConfig(cfg, companyId);
  }
}

import fs from 'fs/promises';
import path from 'path';
import { listTableColumnMeta } from '../../db/index.js';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

const MAX_DISPLAY_FIELDS = 20;

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(
    'tableDisplayFields.json',
    companyId,
  );
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return { cfg: JSON.parse(data), isDefault };
  } catch {
    return { cfg: {}, isDefault: true };
  }
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath('tableDisplayFields.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function normalizeDisplayFieldList(list) {
  if (!Array.isArray(list)) return [];
  const normalized = Array.from(
    new Set(
      list
        .filter((field) => typeof field === 'string' && field.trim())
        .map((field) => field.trim()),
    ),
  );
  return normalized.slice(0, MAX_DISPLAY_FIELDS);
}

function normalizeSingleConfig(entry = {}) {
  const idField =
    typeof entry.idField === 'string' && entry.idField.trim()
      ? entry.idField.trim()
      : typeof entry.id_field === 'string' && entry.id_field.trim()
      ? entry.id_field.trim()
      : '';
  const displayFields = normalizeDisplayFieldList(
    entry.displayFields ?? entry.display_fields,
  );
  const filterColumn =
    typeof entry.filterColumn === 'string' && entry.filterColumn.trim()
      ? entry.filterColumn.trim()
      : typeof entry.filter_column === 'string' && entry.filter_column.trim()
      ? entry.filter_column.trim()
      : '';
  const rawFilterValue =
    entry.filterValue ?? entry.filter_value ?? entry.filter ?? '';
  const filterValue =
    rawFilterValue === null || rawFilterValue === undefined
      ? ''
      : String(rawFilterValue).trim();

  const normalized = {
    idField: idField || undefined,
    displayFields,
  };
  if (filterColumn) normalized.filterColumn = filterColumn;
  if (filterValue) normalized.filterValue = filterValue;
  return normalized;
}

function normalizeTableConfig(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return { idField: undefined, displayFields: [], filters: [] };
  }
  const base = normalizeSingleConfig(entry);
  const filters = Array.isArray(entry.filters)
    ? entry.filters
        .map((filter) => normalizeSingleConfig(filter))
        .filter(
          (filter) =>
            filter.filterColumn ||
            filter.filterValue ||
            filter.idField ||
            (Array.isArray(filter.displayFields) && filter.displayFields.length > 0),
        )
    : [];
  return {
    idField: base.idField,
    displayFields: base.displayFields,
    filters,
  };
}

function selectConfigForFilter(tableConfig, filterColumn, filterValue) {
  const normalizedColumn =
    typeof filterColumn === 'string' && filterColumn.trim() ? filterColumn.trim() : '';
  const normalizedValue =
    filterValue === null || filterValue === undefined
      ? ''
      : String(filterValue).trim();

  if (!normalizedColumn) {
    return tableConfig;
  }

  let matched = null;
  for (const entry of tableConfig.filters || []) {
    if (!entry?.filterColumn || entry.filterColumn !== normalizedColumn) continue;
    const entryValue =
      entry.filterValue === null || entry.filterValue === undefined
        ? ''
        : String(entry.filterValue).trim();
    if (normalizedValue && entryValue === normalizedValue) {
      matched = entry;
      break;
    }
    if (!matched && !entryValue) {
      matched = entry;
    }
  }

  if (!matched) {
    return tableConfig;
  }

  return {
    idField: matched.idField || tableConfig.idField,
    displayFields:
      Array.isArray(matched.displayFields) && matched.displayFields.length > 0
        ? matched.displayFields
        : tableConfig.displayFields,
    filters: tableConfig.filters || [],
  };
}

export async function getDisplayFields(table, companyId = 0, filterColumn, filterValue) {
  const { cfg, isDefault } = await readConfig(companyId);
  if (cfg[table]) {
    const normalized = normalizeTableConfig(cfg[table]);
    const selected = selectConfigForFilter(normalized, filterColumn, filterValue);
    return { config: selected, isDefault };
  }

  try {
    const meta = await listTableColumnMeta(table, companyId);
    if (!Array.isArray(meta) || meta.length === 0) {
      return { config: { idField: null, displayFields: [], filters: [] }, isDefault };
    }
    const idField =
      meta.find((c) => String(c.key).toUpperCase() === 'PRI')?.name || meta[0].name;
    const displayFields = meta
      .map((c) => c.name)
      .filter((n) => n !== idField)
      .slice(0, 3);
    return { config: { idField, displayFields, filters: [] }, isDefault };
  } catch {
    return { config: { idField: null, displayFields: [], filters: [] }, isDefault };
  }
}

export async function getAllDisplayFields(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const normalized = {};
  Object.entries(cfg || {}).forEach(([tableName, entry]) => {
    normalized[tableName] = normalizeTableConfig(entry);
  });
  return { config: normalized, isDefault };
}

export async function setDisplayFields(
  table,
  { idField, displayFields, filters },
  companyId = 0,
) {
  if (!Array.isArray(displayFields)) displayFields = [];
  if (displayFields.length > MAX_DISPLAY_FIELDS) {
    throw new Error('Up to 20 display fields can be configured');
  }

  const normalizedFilters = Array.isArray(filters)
    ? filters.map((filter) => normalizeSingleConfig(filter))
    : [];

  normalizedFilters.forEach((filter) => {
    if (Array.isArray(filter.displayFields) && filter.displayFields.length > MAX_DISPLAY_FIELDS) {
      throw new Error('Up to 20 display fields can be configured');
    }
  });

  const { cfg } = await readConfig(companyId);
  const normalized = normalizeTableConfig({
    idField,
    displayFields,
    filters: normalizedFilters,
  });
  cfg[table] = normalized;
  await writeConfig(cfg, companyId);
  return cfg[table];
}

export async function removeDisplayFields(table, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (cfg[table]) {
    delete cfg[table];
    await writeConfig(cfg, companyId);
  }
}

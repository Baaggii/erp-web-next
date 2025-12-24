import fs from 'fs/promises';
import path from 'path';
import { listTableColumnMeta } from '../../db/index.js';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

const MAX_DISPLAY_FIELDS = 20;
const CONFIG_FILE = 'tableDisplayFields.json';
const normalizedCache = new Map();

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(CONFIG_FILE, companyId);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return { cfg: JSON.parse(data), isDefault };
  } catch {
    return { cfg: {}, isDefault: true };
  }
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath(CONFIG_FILE, companyId);
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

function normalizeFilterValue(rawFilterValue) {
  if (rawFilterValue === undefined) return undefined;
  if (rawFilterValue === null) return null;
  const normalized = String(rawFilterValue).trim();
  return normalized || undefined;
}

function normalizeSingleConfig(entry = {}) {
  const idField =
    typeof entry.idField === 'string' && entry.idField.trim()
      ? entry.idField.trim()
      : typeof entry.id_field === 'string' && entry.id_field.trim()
      ? entry.id_field.trim()
      : '';
  const displayFields = normalizeDisplayFieldList(entry.displayFields ?? entry.display_fields);
  const filterColumn =
    typeof entry.filterColumn === 'string' && entry.filterColumn.trim()
      ? entry.filterColumn.trim()
      : typeof entry.filter_column === 'string' && entry.filter_column.trim()
      ? entry.filter_column.trim()
      : '';
  const filterValue = normalizeFilterValue(
    entry.filterValue ?? entry.filter_value ?? entry.filter ?? undefined,
  );

  const normalized = {
    idField: idField || undefined,
    displayFields,
  };
  if (filterColumn) normalized.filterColumn = filterColumn;
  if (filterValue !== undefined) normalized.filterValue = filterValue;
  return normalized;
}

function normalizeTableDisplayFields(rawConfig = {}) {
  const result = [];
  const sourceEntries = Array.isArray(rawConfig)
    ? rawConfig
    : Object.entries(rawConfig || {}).map(([table, cfg]) => ({ table, ...cfg }));

  for (const entry of sourceEntries) {
    const table = typeof entry.table === 'string' ? entry.table.trim() : '';
    if (!table) continue;
    const base = normalizeSingleConfig(entry);

    if (base.idField && base.displayFields) {
      result.push({
        table,
        ...base,
      });
    }

    if (Array.isArray(entry.filters)) {
      for (const filter of entry.filters) {
        const normalizedFilter = normalizeSingleConfig(filter);
        if (
          normalizedFilter.idField ||
          normalizedFilter.filterColumn ||
          normalizedFilter.filterValue !== undefined ||
          (Array.isArray(normalizedFilter.displayFields) &&
            normalizedFilter.displayFields.length > 0)
        ) {
          result.push({
            table,
            ...normalizedFilter,
          });
        }
      }
    }
  }

  return result;
}

function validateDisplayConfigs(configs) {
  const seen = new Set();

  configs.forEach((cfg) => {
    const key = [
      cfg.table,
      cfg.idField,
      cfg.filterColumn || '',
      cfg.filterValue ?? '',
    ].join('|');

    if (seen.has(key)) {
      throw new Error(`Duplicate tableDisplayFields config detected: ${key}`);
    }
    seen.add(key);

    if (cfg.filterColumn && cfg.filterValue === undefined) {
      throw new Error(`filterColumn without filterValue in ${cfg.table}`);
    }
  });
}

function groupByTable(configs = []) {
  return configs.reduce((map, cfg) => {
    if (!cfg?.table) return map;
    if (!map[cfg.table]) map[cfg.table] = [];
    map[cfg.table].push(cfg);
    return map;
  }, {});
}

async function getDefaultDisplayConfig(table, companyId = 0) {
  try {
    const meta = await listTableColumnMeta(table, companyId);
    if (!Array.isArray(meta) || meta.length === 0) {
      return { idField: null, displayFields: [] };
    }
    const idField =
      meta.find((c) => String(c.key).toUpperCase() === 'PRI')?.name || meta[0].name;
    const displayFields = meta
      .map((c) => c.name)
      .filter((n) => n !== idField)
      .slice(0, 3);
    return { idField, displayFields };
  } catch {
    return { idField: null, displayFields: [] };
  }
}

async function ensureDefaultDisplayConfigs(configs, companyId = 0) {
  const byTable = groupByTable(configs);
  const normalized = [...configs];

  for (const [table, entries] of Object.entries(byTable)) {
    const baseEntry = entries.find((cfg) => !cfg.filterColumn);
    if (baseEntry) {
      if ((!baseEntry.displayFields || baseEntry.displayFields.length === 0) || !baseEntry.idField) {
        const fallback = await getDefaultDisplayConfig(table, companyId);
        if (!baseEntry.idField && fallback.idField) baseEntry.idField = fallback.idField;
        if ((!baseEntry.displayFields || baseEntry.displayFields.length === 0) && fallback.displayFields) {
          baseEntry.displayFields = normalizeDisplayFieldList(fallback.displayFields);
        }
      }
      continue;
    }

    const source = entries.find((cfg) => Array.isArray(cfg.displayFields) && cfg.displayFields.length > 0) || entries[0];
    const fallback = await getDefaultDisplayConfig(table, companyId);
    normalized.push({
      table,
      idField: source?.idField || fallback.idField || undefined,
      displayFields:
        (source && Array.isArray(source.displayFields) && source.displayFields.length > 0
          ? normalizeDisplayFieldList(source.displayFields)
          : normalizeDisplayFieldList(fallback.displayFields)) || [],
    });
  }

  return normalized;
}

function buildTableConfigMap(normalizedConfigs = [], rawConfig = {}) {
  const tableMap = {};
  const grouped = groupByTable(normalizedConfigs);

  for (const [table, entries] of Object.entries(grouped)) {
    const baseEntry = entries.find((cfg) => !cfg.filterColumn) || entries[0] || {};
    const filters = entries
      .filter((cfg) => cfg.filterColumn)
      .map((cfg) => ({
        idField: cfg.idField,
        displayFields: Array.isArray(cfg.displayFields) ? cfg.displayFields : [],
        filterColumn: cfg.filterColumn,
        filterValue: cfg.filterValue ?? undefined,
      }));

    tableMap[table] = {
      idField: baseEntry.idField,
      displayFields: Array.isArray(baseEntry.displayFields) ? baseEntry.displayFields : [],
      filters,
    };

    if (rawConfig?.[table]?.tooltips) {
      tableMap[table].tooltips = rawConfig[table].tooltips;
    }
  }

  return tableMap;
}

async function loadNormalizedConfig(companyId = 0) {
  const cached = normalizedCache.get(companyId);
  if (cached) return cached;

  const { cfg: rawConfig, isDefault } = await readConfig(companyId);
  const flat = normalizeTableDisplayFields(rawConfig);
  const withDefaults = await ensureDefaultDisplayConfigs(flat, companyId);
  validateDisplayConfigs(withDefaults);
  const config = buildTableConfigMap(withDefaults, rawConfig);
  const payload = { normalizedConfigs: withDefaults, config, isDefault };
  normalizedCache.set(companyId, payload);
  return payload;
}

export async function getDisplayFields(table, companyId = 0, filterColumn, filterValue) {
  const { normalizedConfigs, isDefault } = await loadNormalizedConfig(companyId);
  const tableEntries = normalizedConfigs.filter((cfg) => cfg.table === table);

  if (tableEntries.length === 0) {
    const fallback = await getDefaultDisplayConfig(table, companyId);
    return { config: { idField: fallback.idField, displayFields: fallback.displayFields, filters: [] }, isDefault };
  }

  const baseEntry = tableEntries.find((cfg) => !cfg.filterColumn) || tableEntries[0];
  const relationColumn = baseEntry?.idField;
  const displayFields = resolveDisplayFields({
    table,
    relation: { column: relationColumn, filterColumn, filterValue },
    normalizedConfigs: tableEntries,
  });

  const filters = tableEntries
    .filter((cfg) => cfg.filterColumn)
    .map((cfg) => ({
      idField: cfg.idField,
      displayFields: Array.isArray(cfg.displayFields) ? cfg.displayFields : [],
      filterColumn: cfg.filterColumn,
      filterValue: cfg.filterValue ?? undefined,
    }));

  return {
    config: {
      idField: relationColumn || null,
      displayFields:
        (Array.isArray(displayFields) && displayFields.length > 0
          ? displayFields
          : Array.isArray(baseEntry?.displayFields)
          ? baseEntry.displayFields
          : []) || [],
      filters,
    },
    isDefault,
  };
}

export async function getAllDisplayFields(companyId = 0) {
  const { config, isDefault } = await loadNormalizedConfig(companyId);
  return { config, isDefault };
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
  cfg[table] = {
    idField,
    displayFields,
    filters: normalizedFilters,
  };
  await writeConfig(cfg, companyId);
  normalizedCache.delete(companyId);
  const { config } = await loadNormalizedConfig(companyId);
  return config[table];
}

export async function removeDisplayFields(table, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (cfg[table]) {
    delete cfg[table];
    await writeConfig(cfg, companyId);
  }
  normalizedCache.delete(companyId);
}

export function resolveDisplayFields({ table, relation = {}, normalizedConfigs = [] }) {
  if (!table || !Array.isArray(normalizedConfigs) || normalizedConfigs.length === 0) return [];

  const relationColumn =
    typeof relation.column === 'string' && relation.column.trim()
      ? relation.column.trim()
      : typeof relation.idField === 'string' && relation.idField.trim()
      ? relation.idField.trim()
      : '';

  const filterColumn =
    typeof relation.filterColumn === 'string' && relation.filterColumn.trim()
      ? relation.filterColumn.trim()
      : '';
  const filterValue =
    relation.filterValue === null || relation.filterValue === undefined
      ? relation.filterValue
      : String(relation.filterValue).trim();

  let match = normalizedConfigs.find(
    (cfg) =>
      cfg.table === table &&
      cfg.idField === relationColumn &&
      cfg.filterColumn === filterColumn &&
      cfg.filterValue === filterValue,
  );

  if (match) return match.displayFields;

  match = normalizedConfigs.find(
    (cfg) =>
      cfg.table === table &&
      cfg.idField === relationColumn &&
      cfg.filterColumn === filterColumn &&
      (cfg.filterValue === null || cfg.filterValue === '*'),
  );

  if (match) return match.displayFields;

  match = normalizedConfigs.find(
    (cfg) => cfg.table === table && cfg.idField === relationColumn && !cfg.filterColumn,
  );

  return match ? match.displayFields : [];
}

export async function initializeDisplayFieldConfig(companyId = 0) {
  await loadNormalizedConfig(companyId);
}

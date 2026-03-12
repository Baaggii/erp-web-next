import fs from 'fs/promises';
import path from 'path';
import { listTableColumnMeta } from '../../db/index.js';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

const MAX_DISPLAY_FIELDS = 20;

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

function normalizeConfigEntry(entry = {}) {
  const table =
    typeof entry.table === 'string' && entry.table.trim() ? entry.table.trim() : '';
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
  const notificationRole =
    typeof entry.notificationRole === 'string' && entry.notificationRole.trim()
      ? entry.notificationRole.trim()
      : typeof entry.notification_role === 'string' && entry.notification_role.trim()
      ? entry.notification_role.trim()
      : '';
  const notificationDashboardFields = normalizeDisplayFieldList(
    entry.notificationDashboardFields ?? entry.notification_dashboard_fields,
  );
  const notificationEmailFields = normalizeDisplayFieldList(
    entry.notificationEmailFields ?? entry.notification_email_fields,
  );
  const notificationPhoneFields = normalizeDisplayFieldList(
    entry.notificationPhoneFields ?? entry.notification_phone_fields,
  );

  const normalized = {
    table,
    idField: idField || undefined,
    displayFields,
    notificationRole,
    notificationDashboardFields,
    notificationEmailFields,
    notificationPhoneFields,
  };
  if (filterColumn) normalized.filterColumn = filterColumn;
  if (filterValue) normalized.filterValue = filterValue;
  return normalized;
}

function flattenLegacyConfig(cfg = {}) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return [];
  const entries = [];
  Object.entries(cfg).forEach(([tableName, entry]) => {
    if (!entry || typeof entry !== 'object') return;
    const base = normalizeConfigEntry({ ...entry, table: tableName });
    entries.push(base);
    if (Array.isArray(entry.filters)) {
      entry.filters.forEach((filter) => {
        const normalized = normalizeConfigEntry({
          ...filter,
          table: tableName,
          idField: filter?.idField || filter?.id_field || base.idField,
          displayFields:
            filter?.displayFields ??
            filter?.display_fields ??
            base.displayFields ??
            [],
        });
        entries.push(normalized);
      });
    }
  });
  return entries;
}

function normalizeConfigList(data) {
  let entries = [];
  if (Array.isArray(data)) {
    entries = data.map((entry) => normalizeConfigEntry(entry));
  } else if (data && typeof data === 'object') {
    entries = flattenLegacyConfig(data);
  }
  return entries.filter((entry) => {
    if (!entry.table || !entry.idField) return false;
    const hasDisplayFields =
      Array.isArray(entry.displayFields) && entry.displayFields.length > 0;
    const hasNotificationConfig =
      Boolean(entry.notificationRole) ||
      (Array.isArray(entry.notificationDashboardFields) &&
        entry.notificationDashboardFields.length > 0) ||
      (Array.isArray(entry.notificationEmailFields) &&
        entry.notificationEmailFields.length > 0) ||
      (Array.isArray(entry.notificationPhoneFields) &&
        entry.notificationPhoneFields.length > 0);
    return hasDisplayFields || hasNotificationConfig;
  });
}

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(
    'tableDisplayFields.json',
    companyId,
  );
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return { cfg: normalizeConfigList(JSON.parse(data)), isDefault };
  } catch {
    return { cfg: [], isDefault };
  }
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath('tableDisplayFields.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function selectConfigForFilter(tableEntries, filterColumn, filterValue, idField) {
  const normalizedColumn =
    typeof filterColumn === 'string' && filterColumn.trim() ? filterColumn.trim() : '';
  const normalizedValue =
    filterValue === null || filterValue === undefined
      ? ''
      : String(filterValue).trim();

  const normalizedIdField =
    typeof idField === 'string' && idField.trim() ? idField.trim() : '';
  const scopedEntries =
    normalizedIdField && Array.isArray(tableEntries)
      ? tableEntries.filter((entry) => entry.idField === normalizedIdField)
      : tableEntries;

  const candidates =
    Array.isArray(scopedEntries) && scopedEntries.length > 0
      ? scopedEntries
      : normalizedIdField
      ? []
      : tableEntries;

  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  if (normalizedColumn) {
    const exact = candidates.find(
      (entry) =>
        entry.filterColumn === normalizedColumn && (entry.filterValue ?? '') === normalizedValue,
    );
    if (exact) return exact;

    const columnOnly = candidates.find(
      (entry) => entry.filterColumn === normalizedColumn && !entry.filterValue,
    );
    if (columnOnly && !normalizedValue) return columnOnly;
  }

  const defaultEntry = candidates.find(
    (entry) => !entry.filterColumn && !entry.filterValue,
  );
  if (defaultEntry) return defaultEntry;

  return candidates[0];
}

function makeKey(entry) {
  return [
    entry.table,
    entry.idField,
    entry.filterColumn || '',
    entry.filterValue || '',
  ].join('|');
}

export function validateDisplayFieldConfig(newCfg, existingCfgs) {
  if (!newCfg.table) throw new Error('table is required');
  if (!newCfg.idField) throw new Error('idField is required');
  if (!Array.isArray(newCfg.displayFields) || !newCfg.displayFields.length)
    throw new Error('displayFields cannot be empty');

  if (
    (newCfg.filterColumn && !newCfg.filterValue) ||
    (!newCfg.filterColumn && newCfg.filterValue)
  ) {
    throw new Error('filterColumn and filterValue must be used together');
  }

  const key = makeKey(newCfg);
  const exists = existingCfgs.some((cfg) => makeKey(cfg) === key);

  if (exists) {
    throw new Error('Duplicate display field configuration');
  }
}

export async function getDisplayFields(
  table,
  companyId = 0,
  filterColumn,
  filterValue,
  idField,
) {
  const normalizedTable = typeof table === 'string' ? table.trim() : '';

  let options = {};
  if (filterColumn && typeof filterColumn === 'object' && !Array.isArray(filterColumn)) {
    options = filterColumn;
    filterColumn = undefined;
  }

  const normalizedColumn =
    typeof (filterColumn ?? options.filterColumn ?? options.filter_column) === 'string' &&
    (filterColumn ?? options.filterColumn ?? options.filter_column)?.trim()
      ? (filterColumn ?? options.filterColumn ?? options.filter_column).trim()
      : '';
  const rawValue =
    filterValue ?? options.filterValue ?? options.filter_value ?? options.filter ?? undefined;
  const normalizedValue =
    rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
  const normalizedIdField = (() => {
    const candidate =
      idField ??
      options.idField ??
      options.id_field ??
      options.targetColumn ??
      options.target_column;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : '';
  })();
  const includeMatchesOnly = Boolean(options.includeAllMatches || options.matchesOnly);

  const { cfg, isDefault } = await readConfig(companyId);
  const entries = cfg.filter((entry) => entry.table === normalizedTable);
  const filteredById = normalizedIdField
    ? entries.filter((entry) => entry.idField === normalizedIdField)
    : entries;
  const matches = filteredById.length > 0 ? filteredById : normalizedIdField ? [] : entries;
  const matched = selectConfigForFilter(matches, normalizedColumn, normalizedValue, normalizedIdField);
  const responseEntries = includeMatchesOnly ? matches : entries;

  if (matched) {
    return { config: matched, entries: responseEntries, matches, isDefault };
  }

  try {
    const meta = await listTableColumnMeta(normalizedTable, companyId);
    if (!Array.isArray(meta) || meta.length === 0) {
      return {
        config: { table: normalizedTable, idField: null, displayFields: [] },
        entries: responseEntries,
        matches,
        isDefault,
      };
    }
    const idField =
      meta.find((c) => String(c.key).toUpperCase() === 'PRI')?.name || meta[0].name;
    const displayFields = meta
      .map((c) => c.name)
      .filter((n) => n !== idField)
      .slice(0, 3);
    return {
      config: { table: normalizedTable, idField, displayFields },
      entries: responseEntries,
      matches,
      isDefault,
    };
  } catch {
    return {
      config: { table: normalizedTable, idField: null, displayFields: [] },
      entries: responseEntries,
      matches,
      isDefault,
    };
  }
}

export async function getAllDisplayFields(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg, isDefault };
}

export async function setDisplayFields(config, companyId = 0) {
  const normalized = normalizeConfigEntry(config);
  const rawDisplayFieldCount = Array.isArray(config.displayFields)
    ? config.displayFields.filter((field) => typeof field === 'string' && field.trim()).length
    : normalized.displayFields.length;
  if (rawDisplayFieldCount > MAX_DISPLAY_FIELDS) {
    throw new Error('Up to 20 display fields can be configured');
  }

  const { cfg } = await readConfig(companyId);
  const filtered = cfg.filter((entry) => makeKey(entry) !== makeKey(normalized));
  validateDisplayFieldConfig(normalized, filtered);
  const limited = { ...normalized, displayFields: normalized.displayFields.slice(0, MAX_DISPLAY_FIELDS) };
  const updated = [...filtered, limited];
  await writeConfig(updated, companyId);
  return limited;
}

export async function removeDisplayFields(
  { table, idField, filterColumn, filterValue } = {},
  companyId = 0,
) {
  const normalizedTable = typeof table === 'string' ? table.trim() : '';
  if (!normalizedTable) return;
  const normalizedColumn =
    typeof filterColumn === 'string' && filterColumn.trim() ? filterColumn.trim() : '';
  const normalizedValue =
    filterValue === null || filterValue === undefined
      ? ''
      : String(filterValue).trim();
  const normalizedId =
    typeof idField === 'string' && idField.trim() ? idField.trim() : '';

  if (normalizedColumn && !normalizedValue) {
    throw new Error('filterColumn and filterValue must be used together');
  }

  const { cfg } = await readConfig(companyId);
  const remaining = cfg.filter((entry) => {
    if (entry.table !== normalizedTable) return true;
    if (normalizedId && entry.idField !== normalizedId) return true;
    if (normalizedColumn) {
      return (
        entry.filterColumn !== normalizedColumn || (entry.filterValue ?? '') !== normalizedValue
      );
    }
    return false;
  });
  if (remaining.length !== cfg.length) {
    await writeConfig(remaining, companyId);
  }
}

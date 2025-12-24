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

function normalizeFilterValue(rawFilterValue) {
  if (rawFilterValue === undefined) return undefined;
  if (rawFilterValue === null) return null;
  const normalized = String(rawFilterValue).trim();
  return normalized || undefined;
}

function normalizeEntry(entry = {}) {
  const idField =
    typeof entry.idField === 'string' && entry.idField.trim()
      ? entry.idField.trim()
      : typeof entry.id_field === 'string' && entry.id_field.trim()
      ? entry.id_field.trim()
      : '';

  const filterColumn =
    typeof entry.filterColumn === 'string' && entry.filterColumn.trim()
      ? entry.filterColumn.trim()
      : typeof entry.filter_column === 'string' && entry.filter_column.trim()
      ? entry.filter_column.trim()
      : '';

  const filterValue = normalizeFilterValue(entry.filterValue ?? entry.filter_value);

  const normalized = {
    idField: idField || undefined,
    displayFields: normalizeDisplayFieldList(entry.displayFields ?? entry.display_fields),
  };

  if (filterColumn) normalized.filterColumn = filterColumn;
  if (filterValue !== undefined) normalized.filterValue = filterValue;

  return normalized;
}

export function normalizeTableDisplayFields(rawConfig = {}) {
  const normalized = [];

  if (Array.isArray(rawConfig)) {
    rawConfig.forEach((entry) => {
      const table = typeof entry?.table === 'string' ? entry.table.trim() : '';
      if (!table) return;
      const cfg = normalizeEntry(entry);
      if (
        cfg.idField ||
        cfg.filterColumn ||
        cfg.filterValue !== undefined ||
        (Array.isArray(cfg.displayFields) && cfg.displayFields.length > 0)
      ) {
        normalized.push({ table, ...cfg });
      }
    });
    return normalized;
  }

  Object.entries(rawConfig || {}).forEach(([table, entry]) => {
    if (!entry || typeof entry !== 'object' || table === 'isDefault') return;
    const base = normalizeEntry(entry);
    if (
      base.idField ||
      base.filterColumn ||
      base.filterValue !== undefined ||
      (Array.isArray(base.displayFields) && base.displayFields.length > 0)
    ) {
      normalized.push({ table, ...base });
    }
    if (Array.isArray(entry.filters)) {
      entry.filters.forEach((filter) => {
        const normalizedFilter = normalizeEntry(filter);
        if (
          normalizedFilter.idField ||
          normalizedFilter.filterColumn ||
          normalizedFilter.filterValue !== undefined ||
          (Array.isArray(normalizedFilter.displayFields) &&
            normalizedFilter.displayFields.length > 0)
        ) {
          normalized.push({ table, ...normalizedFilter });
        }
      });
    }
  });

  return normalized;
}

function resolveDisplayConfig({ table, relation = {}, normalizedConfigs = [] }) {
  if (!table || !Array.isArray(normalizedConfigs) || normalizedConfigs.length === 0) return null;

  const relationColumn =
    typeof relation.idField === 'string' && relation.idField.trim()
      ? relation.idField.trim()
      : typeof relation.column === 'string' && relation.column.trim()
      ? relation.column.trim()
      : typeof relation.targetColumn === 'string' && relation.targetColumn.trim()
      ? relation.targetColumn.trim()
      : '';

  const filterColumn =
    typeof relation.filterColumn === 'string' && relation.filterColumn.trim()
      ? relation.filterColumn.trim()
      : typeof relation.filter_column === 'string' && relation.filter_column.trim()
      ? relation.filter_column.trim()
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

  if (match) return match;

  match = normalizedConfigs.find(
    (cfg) =>
      cfg.table === table &&
      cfg.idField === relationColumn &&
      cfg.filterColumn === filterColumn &&
      (cfg.filterValue === null || cfg.filterValue === '*'),
  );

  if (match) return match;

  match = normalizedConfigs.find(
    (cfg) => cfg.table === table && cfg.idField === relationColumn && !cfg.filterColumn,
  );

  return match || null;
}

export function resolveDisplayFields({ table, relation = {}, normalizedConfigs = [] }) {
  const match = resolveDisplayConfig({ table, relation, normalizedConfigs });
  return match && Array.isArray(match.displayFields) ? match.displayFields : [];
}

export default function selectDisplayFieldsForRelation(
  tableConfigs = {},
  tableName,
  relation = {},
) {
  if (!tableName) return null;
  const normalized = normalizeTableDisplayFields(tableConfigs).filter(
    (cfg) => cfg.table === tableName,
  );
  if (!normalized.length) return null;

  const match = resolveDisplayConfig({ table: tableName, relation, normalizedConfigs: normalized });
  if (!match) return null;

  return {
    idField: match.idField,
    displayFields: Array.isArray(match.displayFields) ? match.displayFields : [],
  };
}

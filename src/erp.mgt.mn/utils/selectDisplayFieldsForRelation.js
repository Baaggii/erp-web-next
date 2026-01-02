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

function normalizeEntry(entry = {}, tableName = '') {
  const table =
    typeof entry.table === 'string' && entry.table.trim()
      ? entry.table.trim()
      : tableName;
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

  const rawFilterValue = entry.filterValue ?? entry.filter_value ?? '';
  const filterValue =
    rawFilterValue === null || rawFilterValue === undefined
      ? ''
      : String(rawFilterValue).trim();

  const normalized = {
    table,
    idField: idField || undefined,
    displayFields: normalizeDisplayFieldList(entry.displayFields ?? entry.display_fields),
  };

  if (filterColumn) normalized.filterColumn = filterColumn;
  if (filterValue) normalized.filterValue = filterValue;

  return normalized;
}

function normalizeTableEntries(tableConfigs = {}, tableName) {
  if (!tableName) return [];
  if (Array.isArray(tableConfigs)) {
    return tableConfigs
      .map((entry) => normalizeEntry(entry, tableName))
      .filter(
        (entry) =>
          entry.table === tableName &&
          entry.idField &&
          Array.isArray(entry.displayFields) &&
          entry.displayFields.length > 0,
      );
  }
  if (!tableConfigs || typeof tableConfigs !== 'object') return [];
  const tableEntry = tableConfigs[tableName];
  if (!tableEntry || typeof tableEntry !== 'object') return [];
  const entries = [];
  const base = normalizeEntry({ ...tableEntry, table: tableName }, tableName);
  if (base.idField && Array.isArray(base.displayFields) && base.displayFields.length > 0) {
    entries.push(base);
  }
  if (Array.isArray(tableEntry.filters)) {
    tableEntry.filters.forEach((filter) => {
      const normalized = normalizeEntry(
        {
          ...filter,
          table: tableName,
          idField: filter?.idField || filter?.id_field || base.idField,
          displayFields:
            filter?.displayFields ?? filter?.display_fields ?? base.displayFields ?? [],
        },
        tableName,
      );
      if (normalized.idField && normalized.displayFields.length > 0) {
        entries.push(normalized);
      }
    });
  }
  return entries;
}

export function selectDisplayFieldsForRelation(tableConfigs = {}, tableName, relation = {}) {
  const entries = normalizeTableEntries(tableConfigs, tableName);
  if (entries.length === 0) return null;
  const targetColumn = relation.idField ?? relation.column ?? relation.targetColumn;
  const normalizedTarget =
    typeof targetColumn === 'string' && targetColumn.trim()
      ? targetColumn.trim().toLowerCase()
      : '';
  if (!normalizedTarget) return null;

  const relFilterColumn =
    typeof relation.filterColumn === 'string' && relation.filterColumn.trim()
      ? relation.filterColumn.trim().toLowerCase()
      : typeof relation.filter_column === 'string' && relation.filter_column.trim()
      ? relation.filter_column.trim().toLowerCase()
      : '';
  const rawFilterValue = relation.filterValue ?? relation.filter_value;
  const relFilterValue =
    rawFilterValue === null || rawFilterValue === undefined
      ? ''
      : String(rawFilterValue).trim();

  const candidates = entries
    .filter((cfg) => cfg?.idField && cfg.idField.trim().toLowerCase() === normalizedTarget)
    .map((cfg) => ({
      idField: cfg.idField,
      displayFields: Array.isArray(cfg.displayFields) ? cfg.displayFields : [],
      filterColumn: cfg.filterColumn || '',
      filterValue:
        cfg.filterValue === null || cfg.filterValue === undefined
          ? ''
          : String(cfg.filterValue).trim(),
    }));

  if (candidates.length === 0) return null;

  const exactFilterMatch = candidates.find(
    (candidate) =>
      candidate.filterColumn &&
      relFilterColumn &&
      candidate.filterColumn.toLowerCase() === relFilterColumn &&
      candidate.filterValue &&
      relFilterValue &&
      candidate.filterValue === relFilterValue,
  );
  if (exactFilterMatch) return exactFilterMatch;

  const columnMatch = candidates.find(
    (candidate) =>
      candidate.filterColumn &&
      relFilterColumn &&
      candidate.filterColumn.toLowerCase() === relFilterColumn &&
      (!candidate.filterValue || !relFilterValue || candidate.filterValue === relFilterValue),
  );
  if (columnMatch) return columnMatch;

  const baseMatch = candidates.find((candidate) => !candidate.filterColumn);
  if (baseMatch) return baseMatch;

  return candidates[0];
}

export function __normalizeDisplayFieldTableConfig(entry = {}, tableName = '') {
  return normalizeTableEntries(entry, tableName);
}

export function __normalizeDisplayFieldEntry(entry = {}, tableName = '') {
  return normalizeEntry(entry, tableName);
}

export default selectDisplayFieldsForRelation;

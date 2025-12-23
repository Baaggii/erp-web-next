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

  const rawFilterValue = entry.filterValue ?? entry.filter_value ?? '';
  const filterValue =
    rawFilterValue === null || rawFilterValue === undefined
      ? ''
      : String(rawFilterValue).trim();

  const normalized = {
    idField: idField || undefined,
    displayFields: normalizeDisplayFieldList(entry.displayFields ?? entry.display_fields),
  };

  if (filterColumn) normalized.filterColumn = filterColumn;
  if (filterValue) normalized.filterValue = filterValue;

  return normalized;
}

function normalizeTableConfig(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return { idField: undefined, displayFields: [], filters: [] };
  }

  const base = normalizeEntry(entry);
  const filters = Array.isArray(entry.filters)
    ? entry.filters
        .map((filter) => normalizeEntry(filter))
        .filter(
          (filter) =>
            filter.idField ||
            (Array.isArray(filter.displayFields) && filter.displayFields.length > 0) ||
            filter.filterColumn ||
            filter.filterValue,
        )
    : [];

  return { ...base, filters };
}

export function selectDisplayFieldsForRelation(tableConfigs = {}, tableName, relation = {}) {
  if (!tableName) return null;
  const tableEntry = tableConfigs[tableName];
  if (!tableEntry || typeof tableEntry !== 'object') return null;

  const normalized = normalizeTableConfig(tableEntry);
  const targetColumn = relation.idField ?? relation.column ?? relation.targetColumn;
  const normalizedTarget =
    typeof targetColumn === 'string' && targetColumn.trim() ? targetColumn.trim().toLowerCase() : '';
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

  const candidates = [];
  const addCandidate = (cfg) => {
    if (!cfg?.idField || cfg.idField.trim().toLowerCase() !== normalizedTarget) return;
    candidates.push({
      idField: cfg.idField,
      displayFields: Array.isArray(cfg.displayFields) ? cfg.displayFields : [],
      filterColumn: cfg.filterColumn || '',
      filterValue:
        cfg.filterValue === null || cfg.filterValue === undefined ? '' : String(cfg.filterValue).trim(),
    });
  };

  addCandidate(normalized);
  (normalized.filters || []).forEach(addCandidate);

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

export function __normalizeDisplayFieldTableConfig(entry = {}) {
  return normalizeTableConfig(entry);
}

export function __normalizeDisplayFieldEntry(entry = {}) {
  return normalizeEntry(entry);
}

export default selectDisplayFieldsForRelation;

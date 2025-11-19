export function normalizeCombinationPairs(rawList) {
  if (!rawList) return [];
  const list = Array.isArray(rawList) ? rawList : [rawList];
  return list
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const source =
        typeof entry.sourceField === 'string'
          ? entry.sourceField
          : typeof entry.source === 'string'
          ? entry.source
          : typeof entry.source_column === 'string'
          ? entry.source_column
          : typeof entry.sourceColumn === 'string'
          ? entry.sourceColumn
          : null;
      const target =
        typeof entry.targetField === 'string'
          ? entry.targetField
          : typeof entry.target === 'string'
          ? entry.target
          : typeof entry.target_column === 'string'
          ? entry.target_column
          : typeof entry.targetColumn === 'string'
          ? entry.targetColumn
          : null;
      const sourceField = source ? source.trim() : '';
      const targetField = target ? target.trim() : '';
      if (!sourceField || !targetField) return null;
      return { sourceField, targetField };
    })
    .filter(Boolean);
}

function unwrapValue(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value;
  }
  return value;
}

function normalizeComparableValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

export function filterOptionsByCombination({
  column,
  options,
  combinationMap,
  rowValues,
  columnByLowerMap = {},
  relationRowsByColumn = {},
  rowValueAccessor = (row, key) => (row ? row[key] : undefined),
}) {
  if (!Array.isArray(options) || !column) return options;
  const combos = combinationMap?.[column];
  if (!Array.isArray(combos) || combos.length === 0) return options;
  const values = rowValues || {};
  const lowerMap = columnByLowerMap || {};
  const activeFilters = combos
    .map((pair) => {
      const lower = pair.sourceField?.toLowerCase();
      const resolvedKey = lower ? lowerMap[lower] || pair.sourceField : pair.sourceField;
      const rawValue = unwrapValue(values[resolvedKey]);
      const normalizedValue = normalizeComparableValue(rawValue);
      if (!normalizedValue) return null;
      return { targetField: pair.targetField, value: normalizedValue };
    })
    .filter(Boolean);
  if (activeFilters.length === 0) return options;
  const rowMap = relationRowsByColumn?.[column] || {};
  return options.filter((opt) => {
    const rowKey = opt?.value;
    const row = rowMap?.[rowKey];
    if (!row || typeof row !== 'object') {
      // Without row data we cannot evaluate, so keep the option visible.
      return true;
    }
    return activeFilters.every((filter) => {
      const rowValue = rowValueAccessor(row, filter.targetField);
      const normalizedRowValue = normalizeComparableValue(rowValue);
      if (!normalizedRowValue) return false;
      return normalizedRowValue === filter.value;
    });
  });
}

export function parseFieldSource(value = '', primaryTableName = '') {
  if (typeof value !== 'string') {
    return { table: '', column: '', raw: value ? String(value) : '' };
  }
  const trimmed = value.trim();
  if (!trimmed) return { table: '', column: '', raw: '' };
  const parts = trimmed.split('.');
  if (parts.length > 1) {
    const [first, ...rest] = parts;
    if (/^[a-zA-Z0-9_]+$/.test(first)) {
      const normalizedPrimary = typeof primaryTableName === 'string' ? primaryTableName.trim() : '';
      if (normalizedPrimary && first === normalizedPrimary) {
        return { table: '', column: rest.join('.'), raw: trimmed };
      }
      return { table: first, column: rest.join('.'), raw: trimmed };
    }
  }
  return { table: '', column: trimmed, raw: trimmed };
}

export function buildFieldSource(tableName, columnName) {
  const tablePart = typeof tableName === 'string' ? tableName.trim() : '';
  const columnPart = typeof columnName === 'string' ? columnName.trim() : '';
  if (!columnPart) return '';
  if (!tablePart) return columnPart;
  return `${tablePart}.${columnPart}`;
}

export function getColumnDataType(column) {
  if (!column || typeof column !== 'object') return '';
  return String(column.dataType || '').toLowerCase();
}

export function resolveFieldKind(column, { includeJson = false } = {}) {
  const dataType = getColumnDataType(column);
  const comment = String(column?.columnComment || '').toLowerCase();

  if (includeJson && (dataType.includes('json') || comment.includes('json_array'))) {
    return 'json';
  }
  if (dataType.match(/int|decimal|numeric|double|float|real|number|bigint/)) {
    return 'number';
  }
  if (dataType.includes('timestamp') || dataType.includes('datetime')) {
    return 'datetime';
  }
  if (dataType.includes('date')) {
    return 'date';
  }
  if (dataType.includes('time')) {
    return 'time';
  }
  return 'string';
}

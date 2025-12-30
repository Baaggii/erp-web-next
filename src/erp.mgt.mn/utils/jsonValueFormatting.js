export function formatJsonItem(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const keys = Object.keys(value || {});
    if (keys.length === 0) return '';
    if (
      (value.lat !== undefined || value.latitude !== undefined) &&
      (value.lng !== undefined || value.longitude !== undefined)
    ) {
      const lat = value.lat ?? value.latitude;
      const lng = value.lng ?? value.longitude;
      const coords = [lat, lng].filter(
        (coord) => coord !== undefined && coord !== null && coord !== '',
      );
      if (coords.length > 0) return coords.join(', ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return value;
}

export function formatJsonList(value) {
  const list = Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
    ? []
    : [value];

  return list
    .map((item) => formatJsonItem(item))
    .filter((item) => item !== '' && item !== undefined && item !== null)
    .map((item) => (typeof item === 'string' ? item : String(item)))
    .join(', ');
}

export function normalizeInputValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try {
      const isEmptyPlainObject =
        Object.prototype.toString.call(value) === '[object Object]' &&
        Object.keys(value).length === 0;
      if (isEmptyPlainObject) return '';
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return value;
}

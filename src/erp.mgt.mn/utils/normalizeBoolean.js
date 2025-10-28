export default function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return defaultValue;
    }
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return defaultValue;
    }
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return defaultValue;
  }
  if (typeof value === 'bigint') {
    return value !== 0n;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return defaultValue;
    }
    return true;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? defaultValue : true;
  }
  return Boolean(value);
}

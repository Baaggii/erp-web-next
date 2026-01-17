export default function normalizeRelationKey(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return normalizeRelationKey(value.value);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'id')) {
      return normalizeRelationKey(value.id);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'Id')) {
      return normalizeRelationKey(value.Id);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return String(value).trim();
}

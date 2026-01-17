export default function normalizeRelationKey(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    if (value.value !== undefined && value.value !== null) {
      return normalizeRelationKey(value.value);
    }
    if (value.id !== undefined && value.id !== null) {
      return normalizeRelationKey(value.id);
    }
    if (value.Id !== undefined && value.Id !== null) {
      return normalizeRelationKey(value.Id);
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : '';
  }
  return String(value);
}

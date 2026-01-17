import normalizeRelationKey from './normalizeRelationKey.js';

export default function getRelationRowFromMap(map, key) {
  if (!map || key === undefined || key === null) return undefined;

  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return map[key];
  }

  const stringKey = typeof key === 'string' ? key : String(key);
  if (Object.prototype.hasOwnProperty.call(map, stringKey)) {
    return map[stringKey];
  }

  const normalizedKey = normalizeRelationKey(key);
  if (
    normalizedKey !== null &&
    normalizedKey !== undefined &&
    Object.prototype.hasOwnProperty.call(map, normalizedKey)
  ) {
    return map[normalizedKey];
  }

  return undefined;
}

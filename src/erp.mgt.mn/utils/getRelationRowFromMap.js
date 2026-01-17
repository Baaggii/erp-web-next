import normalizeRelationKey from './normalizeRelationKey.js';

function unwrapRelationKey(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.id !== undefined && value.id !== null) return value.id;
  if (value.key !== undefined && value.key !== null) return value.key;
  if (value.code !== undefined && value.code !== null) return value.code;
  if (value.value !== undefined && value.value !== null) return value.value;
  return value;
}

export default function getRelationRowFromMap(map, rawValue) {
  if (!map || typeof map !== 'object') return null;
  if (rawValue === undefined || rawValue === null) return null;

  const candidates = new Set();
  const addCandidate = (value) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'object') return;
    candidates.add(value);
    const strValue = typeof value === 'string' ? value : String(value);
    if (strValue) candidates.add(strValue);
    const normalized = normalizeRelationKey(value);
    if (normalized !== undefined && normalized !== null && normalized !== '') {
      candidates.add(normalized);
    }
  };

  addCandidate(rawValue);
  const unwrapped = unwrapRelationKey(rawValue);
  if (unwrapped !== rawValue) addCandidate(unwrapped);

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return map[key];
    }
  }

  return null;
}

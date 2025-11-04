const DEFAULT_INDEX_PATTERNS = [
  /^display_index$/i,
  /(^|_)(display_index|displayindex)(_|$)/i,
  /(^|_)(display_order|displayorder)(_|$)/i,
  /(^|_)(list_index|listindex)(_|$)/i,
  /(^|_)(order_index|orderindex)(_|$)/i,
  /(^|_)(sort_index|sortindex)(_|$)/i,
  /(^|_)(seq|sequence|sequence_no|sequenceid)(_|$)/i,
  /(^|_)(position|priority)(_|$)/i,
  /^index$/i,
  /(^|_)index(_|$)/i,
  /^order$/i,
];

function buildKeyMap(row) {
  const map = new Map();
  if (!row || typeof row !== 'object') return map;
  Object.keys(row).forEach((key) => {
    map.set(key.toLowerCase(), key);
  });
  return map;
}

function parseIndexValue(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { numeric: true, sortValue: raw, rawValue: raw };
  }
  if (typeof raw === 'bigint') {
    return { numeric: true, sortValue: Number(raw), rawValue: Number(raw) };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (Number.isFinite(num)) {
      return { numeric: true, sortValue: num, rawValue: num };
    }
    return { numeric: false, sortValue: trimmed.toLowerCase(), rawValue: trimmed };
  }
  return null;
}

export function extractRowIndex(row, { indexField, indexFields } = {}) {
  if (!row || typeof row !== 'object') return null;
  const keyMap = buildKeyMap(row);
  const candidates = [];

  if (typeof indexField === 'string' && indexField.trim()) {
    candidates.push(indexField.trim());
  }
  if (Array.isArray(indexFields)) {
    indexFields.forEach((field) => {
      if (typeof field === 'string' && field.trim()) {
        candidates.push(field.trim());
      }
    });
  }

  const seen = new Set();
  const tryField = (field) => {
    const lower = field.toLowerCase();
    if (seen.has(lower)) return null;
    seen.add(lower);
    const actualKey = keyMap.get(lower);
    if (!actualKey) return null;
    const parsed = parseIndexValue(row[actualKey]);
    if (!parsed) return null;
    return { key: actualKey, ...parsed };
  };

  for (const candidate of candidates) {
    const info = tryField(candidate);
    if (info) return info;
  }

  const keys = Array.from(keyMap.keys());
  for (const pattern of DEFAULT_INDEX_PATTERNS) {
    const match = keys.find((key) => pattern.test(key));
    if (!match) continue;
    const info = tryField(match);
    if (info) return info;
  }

  return null;
}

export function sortRowsByIndex(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return Array.isArray(rows) ? rows.slice() : [];
  const annotated = rows.map((row, originalIndex) => ({
    row,
    originalIndex,
    indexInfo: extractRowIndex(row, options),
  }));

  annotated.sort((a, b) => {
    const aInfo = a.indexInfo;
    const bInfo = b.indexInfo;
    const aHas = aInfo != null;
    const bHas = bInfo != null;
    if (aHas && bHas) {
      if (aInfo.numeric && bInfo.numeric && aInfo.sortValue !== bInfo.sortValue) {
        return aInfo.sortValue - bInfo.sortValue;
      }
      if (aInfo.numeric && !bInfo.numeric) return -1;
      if (!aInfo.numeric && bInfo.numeric) return 1;
      const aKey = aInfo.numeric ? aInfo.sortValue : aInfo.rawValue;
      const bKey = bInfo.numeric ? bInfo.sortValue : bInfo.rawValue;
      if (aKey !== bKey) {
        return String(aKey).localeCompare(String(bKey), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      }
      return a.originalIndex - b.originalIndex;
    }
    if (aHas) return -1;
    if (bHas) return 1;
    return a.originalIndex - b.originalIndex;
  });

  return annotated.map((entry) => entry.row);
}

export default sortRowsByIndex;

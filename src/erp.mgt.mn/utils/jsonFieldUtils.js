export function extractPrimitiveValue(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return extractPrimitiveValue(value.value);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'id')) {
      return extractPrimitiveValue(value.id);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'key')) {
      return extractPrimitiveValue(value.key);
    }
  }
  return value;
}

export function normalizeJsonArray(input) {
  if (input === undefined || input === null || input === '') return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => extractPrimitiveValue(item))
      .filter((item) => item !== undefined && item !== null && item !== '');
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeJsonArray(parsed);
    } catch {
      /* ignore parse errors */
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    }
    return [trimmed];
  }
  return [input];
}

export function serializeJsonArray(input) {
  const arr = normalizeJsonArray(input);
  return JSON.stringify(arr);
}

export function formatJsonDisplay(input, { labelLookup = {}, relationLookup = {} } = {}) {
  const values = normalizeJsonArray(input);
  const labels = values
    .map((val) => {
      const key = extractPrimitiveValue(val);
      if (key === undefined || key === null || key === '') return null;
      const lookupKey = String(key);
      if (labelLookup && Object.prototype.hasOwnProperty.call(labelLookup, lookupKey)) {
        return labelLookup[lookupKey];
      }
      if (relationLookup && relationLookup[key]) {
        const row = relationLookup[key];
        const parts = [];
        if (row.id !== undefined && row.id !== null) parts.push(row.id);
        Object.values(row)
          .filter((v) => v !== undefined && v !== null && v !== '')
          .slice(0, 2)
          .forEach((v) => parts.push(v));
        if (parts.length > 0) return parts.join(' - ');
      }
      return key;
    })
    .filter((val) => val !== undefined && val !== null && val !== '');
  if (labels.length === 0) return '—';
  return labels.map((val) => (typeof val === 'string' ? val : String(val))).join(', ');
}

export function mergeJsonArray(existing, nextValue) {
  const current = normalizeJsonArray(existing);
  const incoming = normalizeJsonArray(nextValue);
  const set = new Set(current.map((item) => String(item)));
  incoming.forEach((item) => {
    const key = String(item);
    if (!set.has(key)) {
      set.add(key);
      current.push(item);
    }
  });
  return current;
}

export function removeJsonArrayValue(list, target) {
  const arr = normalizeJsonArray(list);
  const targetKey = target === null || target === undefined ? '' : String(target);
  return arr.filter((item) => String(item) !== targetKey);
}

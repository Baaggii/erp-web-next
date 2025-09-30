const ROW_ID_PREFIX = 'b64:';

function decodeBase64Url(part) {
  const normalized = String(part)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function resolveExpectedParts(expected) {
  if (expected == null) return undefined;
  if (Array.isArray(expected)) return expected.length;
  if (typeof expected === 'number') {
    return Number.isInteger(expected) && expected > 0 ? expected : undefined;
  }
  if (typeof expected === 'object') {
    if (Number.isInteger(expected.expectedParts) && expected.expectedParts > 0) {
      return expected.expectedParts;
    }
    if (Array.isArray(expected.pkColumns)) {
      return expected.pkColumns.length;
    }
  }
  return undefined;
}

export function deserializeRowId(id, expectedParts) {
  if (id == null) return [];
  if (Array.isArray(id)) {
    return id.map((value) => (value == null ? value : String(value)));
  }
  const str = String(id);
  const expected = resolveExpectedParts(expectedParts);
  if (str.startsWith(ROW_ID_PREFIX)) {
    const encoded = str.slice(ROW_ID_PREFIX.length);
    if (!encoded) return [];
    return encoded.split('.').map((part) => {
      try {
        return decodeBase64Url(part);
      } catch {
        return part;
      }
    });
  }
  if (str === '') return [''];
  if (expected === 1 && str.includes('-')) {
    return [str];
  }
  return str.split('-');
}

export { ROW_ID_PREFIX };

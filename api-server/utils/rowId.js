const ROW_ID_PREFIX = 'b64:';

function decodeBase64Url(part) {
  const normalized = String(part)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function deserializeRowId(id) {
  if (id == null) return [];
  if (Array.isArray(id)) {
    return id.map((value) => (value == null ? value : String(value)));
  }
  const str = String(id);
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
  return str.split('-');
}

export { ROW_ID_PREFIX };

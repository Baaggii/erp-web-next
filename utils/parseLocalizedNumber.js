export function parseLocalizedNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const compacted = trimmed.replace(/[\s\u00A0]+/g, '');
  if (!compacted) return null;

  let normalized = compacted;
  const commaCount = (normalized.match(/,/g) || []).length;
  const dotCount = (normalized.match(/\./g) || []).length;

  if (commaCount && dotCount) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (commaCount) {
    if (commaCount === 1) {
      normalized = normalized.replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export default parseLocalizedNumber;

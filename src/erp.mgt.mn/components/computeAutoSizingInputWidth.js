export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function toPositiveNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export default function computeAutoSizingInputWidth({
  value = '',
  placeholder = '',
  minChars = 0,
  charWidth = 1,
} = {}) {
  const normalizedValue = normalizeText(value);
  const normalizedPlaceholder = normalizeText(placeholder);
  const normalizedMinChars = Math.max(0, toPositiveNumber(minChars, 0));
  const normalizedCharWidth = Math.max(1, toPositiveNumber(charWidth, 1));

  const longest = Math.max(
    normalizedMinChars,
    normalizedValue.length,
    normalizedPlaceholder.length,
  );

  return (longest + 1) * normalizedCharWidth;
}

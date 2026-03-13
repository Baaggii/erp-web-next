export function normalizeParamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isLikelyDateField(param) {
  const name = normalizeParamName(param?.name || param);
  if (!name) return false;
  return name.includes('date');
}

export function isStartDateParam(param) {
  const name = normalizeParamName(param?.name || param);
  return name.includes('start') || name.includes('from');
}

export function isEndDateParam(param) {
  const name = normalizeParamName(param?.name || param);
  return name.includes('end') || name.includes('to');
}

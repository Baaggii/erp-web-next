const DATE_PARAM_ALLOWLIST = new Set([
  'startdt',
  'enddt',
  'fromdt',
  'todt',
  'startdatetime',
  'enddatetime',
  'fromdatetime',
  'todatetime',
]);

export function normalizeParamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function readParamSchema(param) {
  if (!param || typeof param !== 'object') {
    return { name: '', dataType: '' };
  }
  return {
    name: typeof param.name === 'string' ? param.name : '',
    dataType: typeof param.dataType === 'string' ? param.dataType : '',
  };
}

export function isLikelyDateParam(paramOrName) {
  const name =
    typeof paramOrName === 'string'
      ? paramOrName
      : readParamSchema(paramOrName).name;
  const dataType =
    typeof paramOrName === 'string'
      ? ''
      : readParamSchema(paramOrName).dataType;

  const normalized = normalizeParamName(name);
  if (!normalized) return false;
  if (normalized.includes('date') || DATE_PARAM_ALLOWLIST.has(normalized)) {
    return true;
  }
  return dataType.toLowerCase().includes('date');
}

export function isStartDateParam(paramOrName) {
  if (!isLikelyDateParam(paramOrName)) return false;
  const name = typeof paramOrName === 'string' ? paramOrName : readParamSchema(paramOrName).name;
  const normalized = normalizeParamName(name);
  return normalized.includes('start') || normalized.includes('from');
}

export function isEndDateParam(paramOrName) {
  if (!isLikelyDateParam(paramOrName)) return false;
  const name = typeof paramOrName === 'string' ? paramOrName : readParamSchema(paramOrName).name;
  const normalized = normalizeParamName(name);
  return normalized.includes('end') || normalized.includes('to');
}

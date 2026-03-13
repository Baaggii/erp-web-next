export function getParamName(param) {
  if (!param || typeof param !== 'object') return '';
  return typeof param.name === 'string' ? param.name : '';
}

export function getParamDataType(param) {
  if (!param || typeof param !== 'object') return '';
  return typeof param.dataType === 'string' ? param.dataType : '';
}

export function normalizeParamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isLikelyDateField(param) {
  const paramName = typeof param === 'string' ? param : getParamName(param);
  const name = normalizeParamName(paramName);
  if (!name) return false;
  return name.includes('date');
}

export function isStartDateParam(param) {
  const paramName = typeof param === 'string' ? param : getParamName(param);
  const name = normalizeParamName(paramName);
  return name.includes('start') || name.includes('from');
}

export function isEndDateParam(param) {
  const paramName = typeof param === 'string' ? param : getParamName(param);
  const name = normalizeParamName(paramName);
  return name.includes('end') || name.includes('to');
}

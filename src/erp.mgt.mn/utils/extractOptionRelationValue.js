export default function extractOptionRelationValue(option, targetColumn) {
  if (!option || !targetColumn) return undefined;
  const candidates = [];
  if (option.meta && typeof option.meta === 'object') candidates.push(option.meta);
  if (option.row && typeof option.row === 'object') candidates.push(option.row);
  if (option.record && typeof option.record === 'object') candidates.push(option.record);
  if (option.data && typeof option.data === 'object') candidates.push(option.data);
  candidates.push(option);
  const normalized = String(targetColumn).toLowerCase();

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (
      Object.prototype.hasOwnProperty.call(candidate, targetColumn) &&
      !isEmptyValue(candidate[targetColumn])
    ) {
      return candidate[targetColumn];
    }
    const match = Object.keys(candidate).find(
      (key) => typeof key === 'string' && key.toLowerCase() === normalized,
    );
    if (match && !isEmptyValue(candidate[match])) {
      return candidate[match];
    }
  }

  return undefined;
}

function isEmptyValue(value) {
  return value === undefined || value === null || value === '';
}

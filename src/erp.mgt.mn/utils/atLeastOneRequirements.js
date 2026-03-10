function normalizeFieldName(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function normalizeAtLeastOneGroups(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((group) => {
      if (!Array.isArray(group)) return [];
      return Array.from(
        new Set(
          group
            .map((field) => normalizeFieldName(field))
            .filter((field) => field),
        ),
      );
    })
    .filter((group) => group.length > 0);
}

export function isValueFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return isValueFilled(value.value);
  }
  return true;
}

export function findMissingAtLeastOneGroups(values = {}, groups = []) {
  const normalizedGroups = normalizeAtLeastOneGroups(groups);
  return normalizedGroups.filter(
    (group) => !group.some((field) => isValueFilled(values[field])),
  );
}


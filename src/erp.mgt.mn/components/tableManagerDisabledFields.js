export function resolveDisabledFieldState({
  editSet,
  formColumns,
  requestType,
  isAdding,
  editing,
  lockedDefaults,
  canonicalizeFormFields,
  buttonPerms,
  getKeyFields,
}) {
  const bypassGuardDefaults = Boolean(buttonPerms?.['New transaction']) && !!isAdding;

  const canonicalizer =
    typeof canonicalizeFormFields === 'function'
      ? canonicalizeFormFields
      : (fields) => fields;

  if (requestType === 'temporary-promote') {
    const canonicalized = canonicalizer(Array.from(new Set([...formColumns]))) || [];
    return { disabledFields: canonicalized, bypassGuardDefaults };
  }

  let disabledFields = [];

  if (!bypassGuardDefaults && editSet) {
    disabledFields = formColumns.filter((c) => !editSet.has(c.toLowerCase()));
  }

  if (!bypassGuardDefaults) {
    if (isAdding) {
      disabledFields = Array.from(new Set([...disabledFields, ...lockedDefaults]));
    } else if (editing) {
      const keyFields = typeof getKeyFields === 'function' ? getKeyFields() : [];
      disabledFields = Array.from(
        new Set([...disabledFields, ...keyFields, ...lockedDefaults]),
      );
    } else {
      disabledFields = Array.from(new Set([...disabledFields, ...lockedDefaults]));
    }
  }

  const canonicalized = canonicalizer(disabledFields) || [];

  return { disabledFields: canonicalized, bypassGuardDefaults };
}

export function filterDisabledFieldsForIdFields({
  disabledFields,
  relationConfigs,
  resolveCanonicalKey,
  validColumns,
}) {
  const list = Array.isArray(disabledFields) ? disabledFields : [];
  if (list.length === 0) return list;

  const canonicalize =
    typeof resolveCanonicalKey === 'function'
      ? (field) => resolveCanonicalKey(field)
      : (field) => field;

  const unlockSet = new Set();

  if (relationConfigs && typeof relationConfigs === 'object') {
    Object.values(relationConfigs).forEach((config) => {
      if (!config || typeof config.idField !== 'string') return;
      const canonicalId = canonicalize(config.idField);
      if (!canonicalId) return;
      if (validColumns instanceof Set && !validColumns.has(canonicalId)) return;
      const sourceKey =
        typeof config.column === 'string'
          ? canonicalize(config.column)
          : canonicalize(config.idField);
      if (sourceKey && sourceKey === canonicalId) return;
      unlockSet.add(canonicalId);
    });
  }

  if (unlockSet.size === 0) {
    return list.slice();
  }

  return list.filter((field) => {
    if (unlockSet.has(field)) return false;
    const canonicalField = canonicalize(field);
    return !unlockSet.has(canonicalField);
  });
}

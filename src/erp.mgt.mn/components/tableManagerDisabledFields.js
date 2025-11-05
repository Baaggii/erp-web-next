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
  relationIdFields,
}) {
  const bypassGuardDefaults = Boolean(buttonPerms?.['New transaction']) && !!isAdding;

  const canonicalizer =
    typeof canonicalizeFormFields === 'function'
      ? canonicalizeFormFields
      : (fields) => fields;

  const canonicalizeField = (field) => {
    if (typeof field !== 'string' || field.length === 0) return null;
    const canonical = canonicalizer([field]);
    if (Array.isArray(canonical) && canonical.length > 0) {
      return canonical[0];
    }
    return field;
  };

  const relationIdSet = new Set();
  if (relationIdFields instanceof Set || Array.isArray(relationIdFields)) {
    const list = relationIdFields instanceof Set ? relationIdFields.values() : relationIdFields;
    for (const value of list) {
      if (typeof value !== 'string') continue;
      const canonical = canonicalizeField(value);
      if (canonical) relationIdSet.add(canonical);
    }
  } else if (typeof relationIdFields === 'string') {
    const canonical = canonicalizeField(relationIdFields);
    if (canonical) relationIdSet.add(canonical);
  }

  const shouldUnlockField = (field) => {
    if (relationIdSet.size === 0) return false;
    const canonical = canonicalizeField(field);
    if (!canonical) return false;
    return relationIdSet.has(canonical);
  };

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

  if (relationIdSet.size > 0 && disabledFields.length > 0) {
    disabledFields = disabledFields.filter((field) => !shouldUnlockField(field));
  }

  const canonicalized = canonicalizer(disabledFields) || [];

  const filteredCanonicalized =
    relationIdSet.size > 0
      ? canonicalized.filter((field) => !shouldUnlockField(field))
      : canonicalized;

  return { disabledFields: filteredCanonicalized, bypassGuardDefaults };
}

export function filterDisabledFieldsForIdFields({
  disabledFields,
  relationConfigs,
  resolveCanonicalKey,
  validColumns,
  relationIdFieldSet,
}) {
  const list = Array.isArray(disabledFields) ? disabledFields : [];
  if (list.length === 0) return list;

  const canonicalize = (field) => {
    if (typeof resolveCanonicalKey === 'function') {
      const resolved = resolveCanonicalKey(field);
      if (resolved) return resolved;
    }
    return typeof field === 'string' ? field : null;
  };

  const registerIdField = (field) => {
    const canonical = canonicalize(field);
    if (canonical) {
      unlockSet.add(canonical);
    }
  };

  const unlockSet = new Set();

  if (relationIdFieldSet instanceof Set || Array.isArray(relationIdFieldSet)) {
    const entries =
      relationIdFieldSet instanceof Set
        ? relationIdFieldSet.values()
        : relationIdFieldSet;
    for (const value of entries) {
      registerIdField(value);
    }
  } else if (typeof relationIdFieldSet === 'string') {
    registerIdField(relationIdFieldSet);
  }

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
      registerIdField(canonicalId);
    });
  }

  if (unlockSet.size === 0) {
    return list.slice();
  }

  return list.filter((field) => {
    const canonicalField = canonicalize(field);
    if (!canonicalField) return true;
    return !unlockSet.has(canonicalField);
  });
}

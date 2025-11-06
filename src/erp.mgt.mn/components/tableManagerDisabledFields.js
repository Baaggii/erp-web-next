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

  const disabledLower = new Set();
  const disabledFields = [];

  const addDisabledField = (field) => {
    if (!field && field !== 0) return;
    const normalized = String(field);
    const lower = normalized.toLowerCase();
    if (disabledLower.has(lower)) return;
    disabledLower.add(lower);
    disabledFields.push(normalized);
  };

  if (editSet instanceof Set) {
    (formColumns || []).forEach((column) => {
      if (!column) return;
      const lower = String(column).toLowerCase();
      if (editSet.has(lower)) return;
      addDisabledField(column);
    });
  }

  if (!bypassGuardDefaults) {
    const applyLocked = (fields) => {
      (Array.isArray(fields) ? fields : []).forEach(addDisabledField);
    };
    if (isAdding) {
      applyLocked(lockedDefaults);
    } else if (editing) {
      const keyFields = typeof getKeyFields === 'function' ? getKeyFields() : [];
      applyLocked(keyFields);
      applyLocked(lockedDefaults);
    } else {
      applyLocked(lockedDefaults);
    }
  }

  const canonicalized = canonicalizer(disabledFields) || disabledFields;

  return { disabledFields: canonicalized, bypassGuardDefaults };
}

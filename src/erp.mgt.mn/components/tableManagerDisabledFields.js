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

  if (editSet) {
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

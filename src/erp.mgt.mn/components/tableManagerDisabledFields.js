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

  let disabledFields = editSet
    ? formColumns.filter((c) => !editSet.has(c.toLowerCase()))
    : [];
  if (requestType === 'temporary-promote') {
    disabledFields = Array.from(new Set([...formColumns]));
  } else if (isAdding) {
    if (!bypassGuardDefaults) {
      disabledFields = Array.from(new Set([...disabledFields, ...lockedDefaults]));
    }
  } else if (editing) {
    const keyFields = typeof getKeyFields === 'function' ? getKeyFields() : [];
    disabledFields = Array.from(
      new Set([...disabledFields, ...keyFields, ...lockedDefaults]),
    );
  } else {
    disabledFields = Array.from(new Set([...disabledFields, ...lockedDefaults]));
  }

  const canonicalizer =
    typeof canonicalizeFormFields === 'function'
      ? canonicalizeFormFields
      : (fields) => fields;
  const canonicalized = canonicalizer(disabledFields) || [];

  return { disabledFields: canonicalized, bypassGuardDefaults };
}

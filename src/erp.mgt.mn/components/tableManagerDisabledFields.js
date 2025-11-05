function normalizeFieldName(field) {
  if (field === undefined || field === null) return null;
  const str = String(field).trim();
  if (!str) return null;
  return str;
}

function coerceHasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    if (value.value !== undefined) return coerceHasValue(value.value);
    if (value.id !== undefined) return coerceHasValue(value.id);
    if (value.branch_id !== undefined) return coerceHasValue(value.branch_id);
    if (value.department_id !== undefined)
      return coerceHasValue(value.department_id);
    if (value.company_id !== undefined) return coerceHasValue(value.company_id);
    if (value.empid !== undefined) return coerceHasValue(value.empid);
  }
  return true;
}

function buildNormalizedFieldState(disabledFields = []) {
  const fieldMap = new Map();
  const active = new Set();

  if (!Array.isArray(disabledFields)) return { fieldMap, active };

  disabledFields.forEach((field) => {
    const normalized = normalizeFieldName(field);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (!fieldMap.has(lower)) fieldMap.set(lower, normalized);
    active.add(lower);
  });

  return { fieldMap, active };
}

function applyFieldPreference({ fields, shouldDisable, state }) {
  if (!Array.isArray(fields) || fields.length === 0) return;
  const { fieldMap, active } = state;
  fields.forEach((field) => {
    const normalized = normalizeFieldName(field);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (!fieldMap.has(lower)) fieldMap.set(lower, normalized);
    if (shouldDisable) active.add(lower);
    else active.delete(lower);
  });
}

function finalizeDisabledFields(state, originalOrder = [], preferenceOrder = []) {
  const { fieldMap, active } = state;
  const seen = new Set();
  const result = [];

  const pushIfActive = (field) => {
    const normalized = normalizeFieldName(field);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (!active.has(lower) || seen.has(lower)) return;
    seen.add(lower);
    result.push(fieldMap.get(lower) || normalized);
  };

  originalOrder.forEach(pushIfActive);
  preferenceOrder.forEach((field) => {
    const normalized = normalizeFieldName(field);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (!active.has(lower) || seen.has(lower)) return;
    seen.add(lower);
    result.push(fieldMap.get(lower) || normalized);
  });

  if (result.length === 0 && active.size > 0) {
    active.forEach((lower) => {
      if (seen.has(lower)) return;
      seen.add(lower);
      result.push(fieldMap.get(lower) || lower);
    });
  }

  return result;
}

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

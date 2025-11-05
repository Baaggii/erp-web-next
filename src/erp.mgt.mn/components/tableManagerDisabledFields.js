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
  requestType,
  isAdding,
  autoFillSession,
  userIdFields = [],
  branchIdFields = [],
  departmentIdFields = [],
  companyIdFields = [],
  user,
  branch,
  department,
  company,
}) {
  if (!Array.isArray(disabledFields) || disabledFields.length === 0)
    return Array.isArray(disabledFields) ? disabledFields : [];

  if (requestType === 'temporary-promote') return disabledFields;

  if (!isAdding) return disabledFields;

  const state = buildNormalizedFieldState(disabledFields);

  const hasUserValue = coerceHasValue(
    user?.empid ?? user?.employeeId ?? user?.employee_id ?? user?.id ?? null,
  );
  const hasBranchValue = coerceHasValue(branch);
  const hasDepartmentValue = coerceHasValue(department);
  const hasCompanyValue = coerceHasValue(company);

  const idPreferenceOrder = [
    ...(userIdFields || []),
    ...(branchIdFields || []),
    ...(departmentIdFields || []),
    ...(companyIdFields || []),
  ];

  if (autoFillSession) {
    applyFieldPreference({
      fields: userIdFields,
      shouldDisable: hasUserValue,
      state,
    });
    applyFieldPreference({
      fields: branchIdFields,
      shouldDisable: hasBranchValue,
      state,
    });
    applyFieldPreference({
      fields: departmentIdFields,
      shouldDisable: hasDepartmentValue,
      state,
    });
    applyFieldPreference({
      fields: companyIdFields,
      shouldDisable: hasCompanyValue,
      state,
    });
  } else {
    applyFieldPreference({ fields: userIdFields, shouldDisable: false, state });
    applyFieldPreference({ fields: branchIdFields, shouldDisable: false, state });
    applyFieldPreference({
      fields: departmentIdFields,
      shouldDisable: false,
      state,
    });
    applyFieldPreference({ fields: companyIdFields, shouldDisable: false, state });
  }

  return finalizeDisabledFields(state, disabledFields, idPreferenceOrder);
}

if (typeof window !== 'undefined') {
  window.filterDisabledFieldsForIdFields = filterDisabledFieldsForIdFields;
}

export function normalizeAccessValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    if (value.id !== undefined && value.id !== null) {
      return normalizeAccessValue(value.id);
    }
    if (value.branch_id !== undefined && value.branch_id !== null) {
      return normalizeAccessValue(value.branch_id);
    }
    if (value.department_id !== undefined && value.department_id !== null) {
      return normalizeAccessValue(value.department_id);
    }
    if (value.value !== undefined && value.value !== null) {
      return normalizeAccessValue(value.value);
    }
  }
  const str = String(value).trim();
  return str === '' ? null : str;
}

function normalizeAccessList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const normalized = [];
  list.forEach((item) => {
    const val = normalizeAccessValue(item);
    if (val !== null) normalized.push(val);
  });
  return normalized;
}

function matchesScope(list, value) {
  if (!Array.isArray(list) || list.length === 0) return true;
  if (value === null) return true;
  return list.includes(value);
}

export function evaluateTransactionFormAccess(info, branchId, departmentId) {
  if (!info || typeof info !== 'object') {
    return {
      allowed: true,
      general: true,
      temporary: false,
      temporaryEnabled: false,
    };
  }
  const branchValue = normalizeAccessValue(branchId);
  const departmentValue = normalizeAccessValue(departmentId);

  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);

  const generalAllowed =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue);

  const temporaryEnabled = Boolean(
    info.supportsTemporarySubmission ??
      info.allowTemporarySubmission ??
      info.supportsTemporary ??
      false,
  );

  const temporaryBranches = normalizeAccessList(info.temporaryAllowedBranches);
  const temporaryDepartments = normalizeAccessList(info.temporaryAllowedDepartments);

  const temporaryAllowed = temporaryEnabled
    ? matchesScope(temporaryBranches, branchValue) &&
      matchesScope(temporaryDepartments, departmentValue)
    : false;

  return {
    allowed: generalAllowed || temporaryAllowed,
    general: generalAllowed,
    temporary: temporaryAllowed,
    temporaryEnabled,
  };
}

export function hasTransactionFormAccess(info, branchId, departmentId) {
  return evaluateTransactionFormAccess(info, branchId, departmentId).allowed;
}

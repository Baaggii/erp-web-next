export function normalizeAccessValue(value) {
  if (value === undefined || value === null) return null;
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

export function hasTransactionFormAccess(info, branchId, departmentId) {
  if (!info || typeof info !== 'object') return true;
  const branchValue = normalizeAccessValue(branchId);
  const departmentValue = normalizeAccessValue(departmentId);

  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);

  const generalAllowed =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue);

  if (generalAllowed) return true;

  const temporaryEnabled = Boolean(
    info.supportsTemporarySubmission ??
      info.allowTemporarySubmission ??
      info.supportsTemporary ??
      false,
  );
  if (!temporaryEnabled) return false;

  const temporaryBranches = normalizeAccessList(info.temporaryAllowedBranches);
  const temporaryDepartments = normalizeAccessList(info.temporaryAllowedDepartments);

  return (
    matchesScope(temporaryBranches, branchValue) &&
    matchesScope(temporaryDepartments, departmentValue)
  );
}

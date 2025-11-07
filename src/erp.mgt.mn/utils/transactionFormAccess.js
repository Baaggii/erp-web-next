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

export function hasTransactionFormAccess(
  info,
  branchId,
  departmentId,
  options = {},
) {
  if (!info || typeof info !== 'object') return true;
  const branchValue = normalizeAccessValue(branchId);
  const departmentValue = normalizeAccessValue(departmentId);
  const workplaceValue = normalizeAccessValue(
    options.workplaceId ?? options.workplaceSessionId ?? options.workplace,
  );
  const rightsList = Array.isArray(options.userRights)
    ? options.userRights
        .map((right) => normalizeAccessValue(right))
        .filter((right) => right !== null)
    : [];

  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);
  const allowedWorkplaces = normalizeAccessList(info.allowedWorkplaces);
  const allowedUserRights = normalizeAccessList(info.allowedUserRights);

  const workplaceAllowed =
    allowedWorkplaces.length === 0 ||
    workplaceValue === null ||
    allowedWorkplaces.includes(workplaceValue);
  const rightsAllowed =
    allowedUserRights.length === 0 ||
    rightsList.some((right) => allowedUserRights.includes(right));

  const generalAllowed =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue) &&
    workplaceAllowed &&
    rightsAllowed;

  if (generalAllowed) return true;

  if (!workplaceAllowed || !rightsAllowed) return false;

  const temporaryEnabled = Boolean(
    info.supportsTemporarySubmission ??
      info.allowTemporarySubmission ??
      info.supportsTemporary ??
      false,
  );
  if (!temporaryEnabled) return false;

  if (options && options.allowTemporaryAnyScope) {
    return true;
  }

  const temporaryBranches = normalizeAccessList(info.temporaryAllowedBranches);
  const temporaryDepartments = normalizeAccessList(info.temporaryAllowedDepartments);

  return (
    matchesScope(temporaryBranches, branchValue) &&
    matchesScope(temporaryDepartments, departmentValue)
  );
}

export function evaluateTransactionFormAccess(
  info,
  branchId,
  departmentId,
  options = {},
) {
  if (!info || typeof info !== 'object') {
    return {
      canPost: true,
      allowTemporary: false,
      allowTemporaryOnly: false,
    };
  }

  const branchValue = normalizeAccessValue(branchId);
  const departmentValue = normalizeAccessValue(departmentId);
  const workplaceValue = normalizeAccessValue(
    options.workplaceId ?? options.workplaceSessionId ?? options.workplace,
  );
  const rightsList = Array.isArray(options.userRights)
    ? options.userRights
        .map((right) => normalizeAccessValue(right))
        .filter((right) => right !== null)
    : [];

  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);
  const allowedWorkplaces = normalizeAccessList(info.allowedWorkplaces);
  const allowedUserRights = normalizeAccessList(info.allowedUserRights);

  const workplaceAllowed =
    allowedWorkplaces.length === 0 ||
    workplaceValue === null ||
    allowedWorkplaces.includes(workplaceValue);
  const rightsAllowed =
    allowedUserRights.length === 0 ||
    rightsList.some((right) => allowedUserRights.includes(right));

  const canPost =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue) &&
    workplaceAllowed &&
    rightsAllowed;

  const temporaryEnabled = Boolean(
    info.supportsTemporarySubmission ??
      info.allowTemporarySubmission ??
      info.supportsTemporary ??
      false,
  );

  let allowTemporary = false;
  if (temporaryEnabled) {
    if (!workplaceAllowed || !rightsAllowed) {
      allowTemporary = false;
    } else if (options && options.allowTemporaryAnyScope) {
      allowTemporary = true;
    } else {
      const temporaryBranches = normalizeAccessList(info.temporaryAllowedBranches);
      const temporaryDepartments = normalizeAccessList(info.temporaryAllowedDepartments);

      allowTemporary =
        matchesScope(temporaryBranches, branchValue) &&
        matchesScope(temporaryDepartments, departmentValue);
    }
  }

  return {
    canPost,
    allowTemporary,
    allowTemporaryOnly: !canPost && allowTemporary,
  };
}

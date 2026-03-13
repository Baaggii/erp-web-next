import {
  isPositionAllowed,
  matchesScope,
  normalizeAccessList,
  normalizeAccessValue,
} from '../core/accessScope.js';

export { normalizeAccessValue };

function hasRegularAccessUserRight(options = {}) {
  const candidates = [];
  if (Array.isArray(options.userRights)) {
    candidates.push(...options.userRights);
  }
  candidates.push(
    options.userRightId,
    options.userRightValue,
    options.userLevel,
    options.userRight,
    options.userRightName,
    options.userRightLabel,
    options.userLevelName,
  );
  return candidates.some((value) => {
    const normalized = normalizeAccessValue(value);
    if (normalized === null) return false;
    const simplified = normalized.toLowerCase().replace(/[\s_-]+/g, '');
    return simplified === 'regularaccess';
  });
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
  const userRightValue = normalizeAccessValue(
    options.userRightId ??
      options.userLevel ??
      options.userRight ??
      options.userRightName ??
      options.userRightLabel ??
      options.userLevelName,
  );
  const workplaceValue = normalizeAccessValue(options.workplaceId ?? options.workplace);
  const positionValue = normalizeAccessValue(
    options.positionId ?? options.position ?? options.employmentPositionId,
  );
  const procedureValue = normalizeAccessValue(options.procedure);
  const userRightValues = Array.isArray(options.userRights) ? options.userRights : null;
  const workplaceValues = Array.isArray(options.workplaces) ? options.workplaces : null;
  const positionValues = Array.isArray(options.positions) ? options.positions : null;
  const hasRegularAccess = hasRegularAccessUserRight({ ...options, userRightValue });
  const effectiveWorkplace =
    options.workplaceId ?? (Array.isArray(options.workplaces) ? options.workplaces : null);

  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);
  const allowedUserRights = normalizeAccessList(info.allowedUserRights);
  const allowedWorkplaces = normalizeAccessList(info.allowedWorkplaces);
  const allowedPositions = normalizeAccessList(info.allowedPositions);
  const allowedProcedures = normalizeAccessList(info.procedures);

  const generalAllowed =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue) &&
    matchesScope(allowedUserRights, userRightValues ?? userRightValue) &&
    matchesScope(allowedWorkplaces, workplaceValues ?? workplaceValue) &&
    isPositionAllowed(
      allowedPositions,
      positionValues ?? positionValue,
      effectiveWorkplace,
      options,
    ) &&
    matchesScope(allowedProcedures, procedureValue);

  if (generalAllowed || hasRegularAccess) return true;

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
  const temporaryUserRights = normalizeAccessList(info.temporaryAllowedUserRights);
  const temporaryWorkplaces = normalizeAccessList(info.temporaryAllowedWorkplaces);
  const temporaryPositions = normalizeAccessList(info.temporaryAllowedPositions);
  const temporaryProcedures = normalizeAccessList(info.temporaryProcedures);

  return (
    matchesScope(temporaryBranches, branchValue) &&
    matchesScope(temporaryDepartments, departmentValue) &&
    matchesScope(temporaryUserRights, userRightValues ?? userRightValue) &&
    matchesScope(temporaryWorkplaces, workplaceValues ?? workplaceValue) &&
    isPositionAllowed(
      temporaryPositions,
      positionValues ?? positionValue,
      effectiveWorkplace,
      options,
    ) &&
    matchesScope(temporaryProcedures, procedureValue)
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
  const userRightValue = normalizeAccessValue(
    options.userRightId ??
      options.userLevel ??
      options.userRight ??
      options.userRightName ??
      options.userRightLabel ??
      options.userLevelName,
  );
  const workplaceValue = normalizeAccessValue(options.workplaceId ?? options.workplace);
  const positionValue = normalizeAccessValue(
    options.positionId ?? options.position ?? options.employmentPositionId,
  );
  const procedureValue = normalizeAccessValue(options.procedure);
  const userRightValues = Array.isArray(options.userRights) ? options.userRights : null;
  const workplaceValues = Array.isArray(options.workplaces) ? options.workplaces : null;
  const positionValues = Array.isArray(options.positions) ? options.positions : null;
  const hasRegularAccess = hasRegularAccessUserRight({ ...options, userRightValue });
  const effectiveWorkplace =
    options.workplaceId ?? (Array.isArray(options.workplaces) ? options.workplaces : null);

  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);
  const allowedUserRights = normalizeAccessList(info.allowedUserRights);
  const allowedWorkplaces = normalizeAccessList(info.allowedWorkplaces);
  const allowedPositions = normalizeAccessList(info.allowedPositions);
  const allowedProcedures = normalizeAccessList(info.procedures);

  const canPost =
    hasRegularAccess ||
    (matchesScope(allowedBranches, branchValue) &&
      matchesScope(allowedDepartments, departmentValue) &&
      matchesScope(allowedUserRights, userRightValues ?? userRightValue) &&
      matchesScope(allowedWorkplaces, workplaceValues ?? workplaceValue) &&
      isPositionAllowed(
        allowedPositions,
        positionValues ?? positionValue,
        effectiveWorkplace,
        options,
      ) &&
      matchesScope(allowedProcedures, procedureValue));

  const temporaryEnabled = Boolean(
    info.supportsTemporarySubmission ??
      info.allowTemporarySubmission ??
      info.supportsTemporary ??
      false,
  );

  let allowTemporary = false;
  if (temporaryEnabled) {
    if (options && options.allowTemporaryAnyScope) {
      allowTemporary = true;
    } else {
      const temporaryBranches = normalizeAccessList(info.temporaryAllowedBranches);
      const temporaryDepartments = normalizeAccessList(info.temporaryAllowedDepartments);
      const temporaryUserRights = normalizeAccessList(info.temporaryAllowedUserRights);
      const temporaryWorkplaces = normalizeAccessList(info.temporaryAllowedWorkplaces);
      const temporaryPositions = normalizeAccessList(info.temporaryAllowedPositions);
      const temporaryProcedures = normalizeAccessList(info.temporaryProcedures);

      allowTemporary =
        matchesScope(temporaryBranches, branchValue) &&
        matchesScope(temporaryDepartments, departmentValue) &&
      matchesScope(temporaryUserRights, userRightValues ?? userRightValue) &&
      matchesScope(temporaryWorkplaces, workplaceValues ?? workplaceValue) &&
      isPositionAllowed(
        temporaryPositions,
        positionValues ?? positionValue,
        effectiveWorkplace,
        options,
      ) &&
      matchesScope(temporaryProcedures, procedureValue);
    }
  }

  return {
    canPost,
    allowTemporary,
    allowTemporaryOnly: !canPost && allowTemporary,
  };
}

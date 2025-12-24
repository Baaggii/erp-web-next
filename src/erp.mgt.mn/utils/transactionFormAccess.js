import {
  resolveEffectivePositions,
  resolveWorkplaceAssignmentsFromOptions,
} from '../../../utils/accessControl.js';

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
  if (Array.isArray(value)) {
    const normalizedValues = value
      .map((item) => normalizeAccessValue(item))
      .filter((val) => val !== null);
    if (normalizedValues.length === 0) return false;
    return normalizedValues.some((val) => list.includes(val));
  }
  if (value === null) return true;
  return list.includes(value);
}

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
  const workplaceAssignments = resolveWorkplaceAssignmentsFromOptions(
    effectiveWorkplace,
    options,
    normalizeAccessValue,
  );
  const resolvedPositions = resolveEffectivePositions({
    workplaceId: effectiveWorkplace,
    employmentPositionId: positionValues ?? positionValue,
    workplaceAssignments,
    normalizeValue: normalizeAccessValue,
    logger: options?.logger,
    userId: options?.userId ?? options?.empid ?? options?.employeeId,
  });
  const positionAllowedFor = (allowedPositions) => {
    if (resolvedPositions.mode === 'deny') {
      return Array.isArray(allowedPositions) &&
        allowedPositions.length === 0 &&
        !resolvedPositions.hasWorkplace;
    }
    return matchesScope(allowedPositions, resolvedPositions.positions);
  };

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
    positionAllowedFor(allowedPositions) &&
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
    positionAllowedFor(temporaryPositions) &&
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
  const workplaceAssignments = resolveWorkplaceAssignmentsFromOptions(
    effectiveWorkplace,
    options,
    normalizeAccessValue,
  );
  const resolvedPositions = resolveEffectivePositions({
    workplaceId: effectiveWorkplace,
    employmentPositionId: positionValues ?? positionValue,
    workplaceAssignments,
    normalizeValue: normalizeAccessValue,
    logger: options?.logger,
    userId: options?.userId ?? options?.empid ?? options?.employeeId,
  });
  const positionAllowedFor = (allowedPositions) => {
    if (resolvedPositions.mode === 'deny') {
      return Array.isArray(allowedPositions) &&
        allowedPositions.length === 0 &&
        !resolvedPositions.hasWorkplace;
    }
    return matchesScope(allowedPositions, resolvedPositions.positions);
  };

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
      positionAllowedFor(allowedPositions) &&
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
        positionAllowedFor(temporaryPositions) &&
        matchesScope(temporaryProcedures, procedureValue);
    }
  }

  return {
    canPost,
    allowTemporary,
    allowTemporaryOnly: !canPost && allowTemporary,
  };
}

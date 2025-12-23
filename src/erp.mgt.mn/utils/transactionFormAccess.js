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

function resolveWorkplacePositions(options, workplaceValue) {
  if (!options || typeof options !== 'object') return [];
  const workplaces = Array.isArray(workplaceValue) ? workplaceValue : [workplaceValue];
  const resolved = new Set();

  for (const wp of workplaces) {
    const normalizedWorkplace = normalizeAccessValue(wp);
    if (normalizedWorkplace === null) continue;

    const mapCandidates = [
      options.workplacePositionMap,
      options.workplacePositionById,
      options.workplacePositionsMap,
    ];
    for (const map of mapCandidates) {
      if (map && typeof map === 'object' && !Array.isArray(map)) {
        const mappedPosition = normalizeAccessValue(map[normalizedWorkplace]);
        if (mappedPosition !== null) resolved.add(mappedPosition);
      }
    }

    const listCandidates = [
      options.workplacePositions,
      options.workplacesWithPositions,
    ];
    for (const list of listCandidates) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const entryWorkplace = normalizeAccessValue(
          entry?.workplaceId ?? entry?.workplace_id ?? entry?.workplace ?? entry?.id,
        );
        if (entryWorkplace !== normalizedWorkplace) continue;
        const positionId = normalizeAccessValue(
          entry?.positionId ??
            entry?.position_id ??
            entry?.position ??
            entry?.workplacePositionId ??
            entry?.workplace_position_id,
        );
        if (positionId !== null) resolved.add(positionId);
      }
    }

    const directPosition = normalizeAccessValue(
      options.workplacePositionId ??
        options.workplacePosition ??
        options.workplace_position_id ??
        options.workplace_position,
    );
    if (directPosition !== null) resolved.add(directPosition);
  }

  return Array.from(resolved);
}

function isPositionAllowed(allowedPositions, positionValue, workplaceValue, options) {
  if (!Array.isArray(allowedPositions) || allowedPositions.length === 0) return true;

  const workplacePositions = resolveWorkplacePositions(options, workplaceValue);
  if (workplacePositions.length > 0) {
    return workplacePositions.some((workplacePosition) =>
      matchesScope(allowedPositions, workplacePosition),
    );
  }

  return matchesScope(allowedPositions, positionValue);
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
    options.userRightId ?? options.userLevel ?? options.userRight,
  );
  const workplaceValue = normalizeAccessValue(options.workplaceId ?? options.workplace);
  const positionValue = normalizeAccessValue(
    options.positionId ?? options.position ?? options.employmentPositionId,
  );
  const procedureValue = normalizeAccessValue(options.procedure);
  const userRightValues = Array.isArray(options.userRights) ? options.userRights : null;
  const workplaceValues = Array.isArray(options.workplaces) ? options.workplaces : null;
  const positionValues = Array.isArray(options.positions) ? options.positions : null;

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
      workplaceValues ?? workplaceValue,
      options,
    ) &&
    matchesScope(allowedProcedures, procedureValue);

  if (generalAllowed) return true;

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
      workplaceValues ?? workplaceValue,
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
    options.userRightId ?? options.userLevel ?? options.userRight,
  );
  const workplaceValue = normalizeAccessValue(options.workplaceId ?? options.workplace);
  const positionValue = normalizeAccessValue(
    options.positionId ?? options.position ?? options.employmentPositionId,
  );
  const procedureValue = normalizeAccessValue(options.procedure);
  const userRightValues = Array.isArray(options.userRights) ? options.userRights : null;
  const workplaceValues = Array.isArray(options.workplaces) ? options.workplaces : null;
  const positionValues = Array.isArray(options.positions) ? options.positions : null;

  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);
  const allowedUserRights = normalizeAccessList(info.allowedUserRights);
  const allowedWorkplaces = normalizeAccessList(info.allowedWorkplaces);
  const allowedPositions = normalizeAccessList(info.allowedPositions);
  const allowedProcedures = normalizeAccessList(info.procedures);

  const canPost =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue) &&
    matchesScope(allowedUserRights, userRightValues ?? userRightValue) &&
    matchesScope(allowedWorkplaces, workplaceValues ?? workplaceValue) &&
    isPositionAllowed(
      allowedPositions,
      positionValues ?? positionValue,
      workplaceValues ?? workplaceValue,
      options,
    ) &&
    matchesScope(allowedProcedures, procedureValue);

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
          workplaceValues ?? workplaceValue,
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

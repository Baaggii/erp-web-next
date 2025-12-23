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
  const normalizedValue = normalizeAccessValue(value);
  if (normalizedValue === null) return true;
  return list.includes(normalizedValue);
}

function resolveWorkplacePosition(options, workplaceValue) {
  if (!options || typeof options !== 'object') return null;
  const workplaces = Array.isArray(workplaceValue) ? workplaceValue : [workplaceValue];
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
        if (mappedPosition !== null) return mappedPosition;
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
        if (positionId !== null) return positionId;
      }
    }

    const directPosition = normalizeAccessValue(
      options.workplacePositionId ??
        options.workplacePosition ??
        options.workplace_position_id ??
        options.workplace_position,
    );
    if (directPosition !== null) return directPosition;
  }
  return null;
}

function isPositionAllowed(allowedPositions, positionValue, workplaceValue, options) {
  if (!Array.isArray(allowedPositions) || allowedPositions.length === 0) return true;
  const hasWorkplaceInput = workplaceValue !== null && workplaceValue !== undefined;
  const workplacePosition = resolveWorkplacePosition(options, workplaceValue);
  if (hasWorkplaceInput) {
    if (workplacePosition === null) return false;
    return matchesScope(allowedPositions, workplacePosition);
  }
  if (workplacePosition !== null) return matchesScope(allowedPositions, workplacePosition);
  return matchesScope(allowedPositions, positionValue);
}

export function hasPosTransactionAccess(info, branchId, departmentId, options = {}) {
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

export function filterPosConfigsByAccess(
  configMap = {},
  branchId,
  departmentId,
  options = {},
) {
  const filtered = {};
  Object.entries(configMap || {}).forEach(([name, cfg]) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (hasPosTransactionAccess(cfg, branchId, departmentId, options)) {
      filtered[name] = cfg;
    }
  });
  return filtered;
}

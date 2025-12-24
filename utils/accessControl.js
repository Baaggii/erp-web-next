export function defaultNormalizeAccessValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function normalizeWorkplaceList(workplaceId, normalizeValue = defaultNormalizeAccessValue) {
  const normalized = [];
  const addWorkplace = (wp) => {
    const normalizedValue = normalizeValue(wp);
    if (normalizedValue === null) return;
    if (!normalized.includes(normalizedValue)) normalized.push(normalizedValue);
  };

  if (Array.isArray(workplaceId)) {
    workplaceId.forEach(addWorkplace);
  } else {
    addWorkplace(workplaceId);
  }
  return normalized;
}

export function resolveWorkplaceAssignmentsFromOptions(
  workplaceId,
  options = {},
  normalizeValue = defaultNormalizeAccessValue,
) {
  const workplaces = normalizeWorkplaceList(workplaceId, normalizeValue);
  if (workplaces.length === 0) return [];

  const assignments = [];
  const seen = new Set();

  const addAssignment = (workplace, position) => {
    const normalizedPosition = normalizeValue(position);
    if (normalizedPosition === null) return;
    const key = `${workplace}|${normalizedPosition}`;
    if (seen.has(key)) return;
    seen.add(key);
    assignments.push({
      workplace_id: workplace,
      workplaceId: workplace,
      position_id: normalizedPosition,
      positionId: normalizedPosition,
    });
  };

  const assignmentLists = [
    options.workplaceAssignments,
    options.workplacePositions,
    options.workplacesWithPositions,
  ];
  assignmentLists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      const entryWorkplace = normalizeValue(
        entry?.workplaceId ?? entry?.workplace_id ?? entry?.workplace ?? entry?.id,
      );
      if (entryWorkplace === null || !workplaces.includes(entryWorkplace)) return;
      addAssignment(
        entryWorkplace,
        entry?.positionId ??
          entry?.position_id ??
          entry?.position ??
          entry?.workplacePositionId ??
          entry?.workplace_position_id,
      );
    });
  });

  const mapCandidates = [
    options.workplacePositionMap,
    options.workplacePositionById,
    options.workplacePositionsMap,
  ];
  mapCandidates.forEach((map) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    workplaces.forEach((wp) => addAssignment(wp, map[wp]));
  });

  const directPosition = normalizeValue(
    options.workplacePositionId ??
      options.workplacePosition ??
      options.workplace_position_id ??
      options.workplace_position,
  );
  if (directPosition !== null) {
    workplaces.forEach((wp) => addAssignment(wp, directPosition));
  }

  return assignments;
}

export function resolveEffectivePositions({
  workplaceId,
  employmentPositionId,
  workplaceAssignments,
  normalizeValue = defaultNormalizeAccessValue,
  logger,
  userId,
} = {}) {
  const workplaces = normalizeWorkplaceList(workplaceId, normalizeValue);
  const hasWorkplace = workplaces.length > 0;
  const resolvedPositions = [];
  const addPosition = (position) => {
    const normalized = normalizeValue(position);
    if (normalized === null) return;
    if (!resolvedPositions.includes(normalized)) resolvedPositions.push(normalized);
  };

  if (hasWorkplace) {
    const assignments = Array.isArray(workplaceAssignments) ? workplaceAssignments : [];
    assignments.forEach((assignment) => {
      const assignmentWorkplace = normalizeValue(
        assignment?.workplaceId ?? assignment?.workplace_id ?? assignment?.workplace,
      );
      if (assignmentWorkplace === null || !workplaces.includes(assignmentWorkplace)) {
        return;
      }
      addPosition(
        assignment?.positionId ??
          assignment?.position_id ??
          assignment?.position ??
          assignment?.workplacePositionId ??
          assignment?.workplace_position_id,
      );
    });

    if (resolvedPositions.length === 0) {
      if (logger?.warn) {
        logger.warn('Workplace exists but no position mapping', { userId, workplaceId });
      }
      return { mode: 'deny', positions: [], hasWorkplace, workplaces };
    }

    return { mode: 'workplace', positions: resolvedPositions, hasWorkplace, workplaces };
  }

  const employmentPositions = [];
  const addEmploymentPosition = (value) => {
    const normalized = normalizeValue(value);
    if (normalized !== null && !employmentPositions.includes(normalized)) {
      employmentPositions.push(normalized);
    }
  };
  if (Array.isArray(employmentPositionId)) {
    employmentPositionId.forEach(addEmploymentPosition);
  } else {
    addEmploymentPosition(employmentPositionId);
  }

  if (employmentPositions.length > 0) {
    return {
      mode: 'employment',
      positions: employmentPositions,
      hasWorkplace,
      workplaces,
    };
  }

  return { mode: 'deny', positions: [], hasWorkplace, workplaces };
}

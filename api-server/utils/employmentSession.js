import {
  normalizeNumericId,
  normalizeWorkplaceAssignments,
} from './workplaceAssignments.js';

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return value;
}

function buildNormalizedAssignment(source = {}, defaults = {}, options = {}) {
  const { fallbackMeta = false } = options;
  const coalesce = (primary, fallback) =>
    primary !== undefined && primary !== null ? primary : fallback;

  const companyId = normalizeNumericId(
    coalesce(
      source.company_id ?? source.companyId,
      fallbackMeta ? defaults.company_id ?? defaults.companyId : null,
    ),
  );
  const companyName =
    trimOrNull(
      coalesce(
        source.company_name ?? source.companyName,
        fallbackMeta ? defaults.company_name ?? defaults.companyName : null,
      ),
    ) ?? null;

  const branchId = normalizeNumericId(
    coalesce(
      source.branch_id ?? source.branchId,
      fallbackMeta ? defaults.branch_id ?? defaults.branchId : null,
    ),
  );
  const branchName =
    trimOrNull(
      coalesce(
        source.branch_name ?? source.branchName,
        fallbackMeta ? defaults.branch_name ?? defaults.branchName : null,
      ),
    ) ?? null;

  const departmentId = normalizeNumericId(
    coalesce(
      source.department_id ?? source.departmentId,
      fallbackMeta ? defaults.department_id ?? defaults.departmentId : null,
    ),
  );
  const departmentName =
    trimOrNull(
      coalesce(
        source.department_name ?? source.departmentName,
        fallbackMeta ? defaults.department_name ?? defaults.departmentName : null,
      ),
    ) ?? null;

  const workplaceId = normalizeNumericId(
    coalesce(
      source.workplace_id ?? source.workplaceId,
      defaults.workplace_id ?? defaults.workplaceId,
    ),
  );
  const workplaceName =
    trimOrNull(
      coalesce(
        source.workplace_name ?? source.workplaceName,
        fallbackMeta ? defaults.workplace_name ?? defaults.workplaceName : null,
      ),
    ) ?? null;
  const workplaceSessionId = normalizeNumericId(
    coalesce(
      source.workplace_session_id ?? source.workplaceSessionId,
      defaults.workplace_session_id ??
        defaults.workplaceSessionId ??
        defaults.workplace_id ??
        defaults.workplaceId,
    ),
  );

  if (workplaceSessionId === null) {
    return null;
  }

  return {
    company_id: companyId,
    companyId: companyId,
    company_name: companyName,
    companyName: companyName,
    branch_id: branchId,
    branchId: branchId,
    branch_name: branchName,
    branchName: branchName,
    department_id: departmentId,
    departmentId: departmentId,
    department_name: departmentName,
    departmentName: departmentName,
    workplace_id: workplaceId,
    workplaceId: workplaceId,
    workplace_name: workplaceName,
    workplaceName: workplaceName,
    workplace_session_id: workplaceSessionId,
    workplaceSessionId: workplaceSessionId,
    workplace_position_id: normalizeNumericId(
      source.workplace_position_id ??
        source.workplacePositionId ??
        source.position_id ??
        source.positionId,
    ),
    workplacePositionId: normalizeNumericId(
      source.workplace_position_id ??
        source.workplacePositionId ??
        source.position_id ??
        source.positionId,
    ),
    workplace_position_name:
      trimOrNull(
        source.workplace_position_name ??
          source.workplacePositionName ??
          source.position_name ??
          source.positionName,
      ) ?? null,
    workplacePositionName:
      trimOrNull(
        source.workplace_position_name ??
          source.workplacePositionName ??
          source.position_name ??
          source.positionName,
      ) ?? null,
  };
}

export function normalizeEmploymentSession(session, assignments = []) {
  if (!session || typeof session !== 'object') {
    return session ?? null;
  }

  const { assignments: normalizedAssignments, sessionIds } =
    normalizeWorkplaceAssignments(assignments);
  const normalizedWorkplaceId = normalizeNumericId(session.workplace_id);
  const normalizedSessionId = normalizeNumericId(session.workplace_session_id);
  const fallbackWorkplaceId =
    normalizedWorkplaceId ??
    (normalizedAssignments.find((item) => item.workplace_id !== null)?.workplace_id ??
      null);
  const fallbackSessionId =
    normalizedSessionId ?? (sessionIds.length ? sessionIds[0] : null);

  const fallbackDefaults = {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplaceId: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplaceSessionId: fallbackSessionId,
    workplace_positions: session.workplace_positions,
  };

  const hydratedAssignments = [];
  const assignmentKeys = new Set();
  normalizedAssignments.forEach((assignment) => {
    const normalizedAssignment = buildNormalizedAssignment(
      assignment,
      fallbackDefaults,
      { fallbackMeta: false },
    );
    if (!normalizedAssignment) {
      return;
    }
    const key = `${normalizedAssignment.workplaceId ?? 'null'}|${
      normalizedAssignment.workplaceSessionId ?? 'null'
    }`;
    if (assignmentKeys.has(key)) return;
    assignmentKeys.add(key);
    hydratedAssignments.push(normalizedAssignment);
  });

  if (hydratedAssignments.length === 0 && fallbackSessionId !== null) {
    const fallbackAssignment = buildNormalizedAssignment(
      session,
      fallbackDefaults,
      { fallbackMeta: true },
    );
    if (fallbackAssignment) {
      const key = `${fallbackAssignment.workplaceId ?? 'null'}|${
        fallbackAssignment.workplaceSessionId ?? 'null'
      }`;
      if (!assignmentKeys.has(key)) {
        assignmentKeys.add(key);
        hydratedAssignments.push(fallbackAssignment);
      }
    }
  }

  const combinedSessionIds = [...sessionIds];
  if (
    fallbackSessionId !== null &&
    !combinedSessionIds.includes(fallbackSessionId)
  ) {
    combinedSessionIds.push(fallbackSessionId);
  }

  const normalizePositionEntry = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') {
      const positionId = normalizeNumericId(
        value.positionId ?? value.position_id ?? value.id,
      );
      const positionName =
        trimOrNull(value.positionName ?? value.position_name ?? value.name) ??
        null;
      if (positionId === null && positionName === null) return null;
      return { positionId, positionName };
    }
    const positionId = normalizeNumericId(value);
    return positionId === null ? null : { positionId, positionName: null };
  };

  const normalizedPositions = {};
  if (session.workplace_positions && typeof session.workplace_positions === 'object') {
    Object.entries(session.workplace_positions).forEach(([workplaceKey, value]) => {
      const workplaceId = normalizeNumericId(workplaceKey);
      if (workplaceId === null) return;
      const entry = normalizePositionEntry(value);
      if (!entry) return;
      normalizedPositions[workplaceId] = entry;
    });
  }

  hydratedAssignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = assignment.workplace_id ?? assignment.workplaceId;
    if (workplaceId === null || workplaceId === undefined) return;
    const positionId =
      normalizeNumericId(
        assignment.workplace_position_id ??
          assignment.workplacePositionId ??
          assignment.position_id ??
          assignment.positionId,
      ) ?? null;
    const positionName =
      trimOrNull(
        assignment.workplace_position_name ??
          assignment.workplacePositionName ??
          assignment.position_name ??
          assignment.positionName,
      ) ?? null;
    normalizedPositions[workplaceId] = {
      positionId,
      positionName,
    };
  });

  const normalizedWorkplacePositionId =
    (fallbackWorkplaceId !== null && fallbackWorkplaceId !== undefined
      ? normalizedPositions[fallbackWorkplaceId]?.positionId
      : null) ??
    session.workplace_position_id ??
    session.workplacePositionId ??
    null;

  const normalizedWorkplacePositionName =
    (fallbackWorkplaceId !== null && fallbackWorkplaceId !== undefined
      ? normalizedPositions[fallbackWorkplaceId]?.positionName
      : null) ??
    session.workplace_position_name ??
    session.workplacePositionName ??
    null;

  const positionedAssignments = hydratedAssignments.map((assignment) => {
    if (!assignment || typeof assignment !== 'object') return assignment;
    const workplaceId = assignment.workplace_id ?? assignment.workplaceId;
    const derived = workplaceId !== null ? normalizedPositions[workplaceId] : null;
    const positionId =
      assignment.workplace_position_id ??
      assignment.workplacePositionId ??
      assignment.position_id ??
      assignment.positionId ??
      derived?.positionId ??
      null;
    const positionName =
      assignment.workplace_position_name ??
      assignment.workplacePositionName ??
      assignment.position_name ??
      assignment.positionName ??
      derived?.positionName ??
      null;
    return {
      ...assignment,
      workplace_position_id: normalizeNumericId(positionId),
      workplacePositionId: normalizeNumericId(positionId),
      workplace_position_name: trimOrNull(positionName),
      workplacePositionName: trimOrNull(positionName),
    };
  });

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplace_position_id: normalizedWorkplacePositionId,
    workplacePositionId: normalizedWorkplacePositionId,
    workplace_position_name: normalizedWorkplacePositionName,
    workplacePositionName: normalizedWorkplacePositionName,
    workplace_assignments: positionedAssignments,
    workplace_session_ids: combinedSessionIds,
    workplace_positions: normalizedPositions,
  };
}

// src/erp.mgt.mn/utils/normalizeEmploymentSession.js
function normalizeNumericId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function collectUnique(values) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    if (value === null || value === undefined) return;
    if (seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

export default function normalizeEmploymentSession(session) {
  if (!session || typeof session !== 'object') {
    return session ?? null;
  }

  const rawAssignments = Array.isArray(session.workplace_assignments)
    ? session.workplace_assignments
    : [];

  const normalizedAssignments = rawAssignments.reduce((list, assignment) => {
    if (!assignment || typeof assignment !== 'object') return list;
    const workplaceId = normalizeNumericId(
      assignment.workplace_id ?? assignment.workplaceId,
    );
    const sessionId = normalizeNumericId(
      assignment.workplace_session_id ??
        assignment.workplaceSessionId ??
        assignment.workplace_id ??
        assignment.workplaceId,
    );
    if (workplaceId === null || sessionId === null) {
      return list;
    }

    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
      workplace_session_id: sessionId,
    };
    list.push(normalizedAssignment);
    return list;
  }, []);

  const assignmentSessionIds = collectUnique(
    normalizedAssignments.map((assignment) => assignment.workplace_session_id),
  );

  const normalizedWorkplaceId = normalizeNumericId(
    session.workplace_id ?? session.workplaceId,
  );
  const normalizedSessionId = normalizeNumericId(
    session.workplace_session_id ??
      session.workplaceSessionId ??
      session.workplace_id ??
      session.workplaceId,
  );

  const fallbackWorkplaceId =
    normalizedWorkplaceId ??
    normalizedAssignments.find((assignment) => assignment.workplace_id !== null)
      ?.workplace_id ??
    null;

  const fallbackSessionId =
    normalizedSessionId ??
    (assignmentSessionIds.length ? assignmentSessionIds[0] : null);

  const normalizePositionEntry = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const positionId = normalizeNumericId(
        value.positionId ?? value.position_id ?? value.id,
      );
      const positionName =
        typeof value.positionName === 'string'
          ? value.positionName.trim()
          : typeof value.position_name === 'string'
            ? value.position_name.trim()
            : typeof value.name === 'string'
              ? value.name.trim()
              : null;
      if (positionId === null && !positionName) return null;
      return { positionId, positionName: positionName || null };
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

  normalizedAssignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = assignment.workplace_id;
    if (workplaceId === null || workplaceId === undefined) return;
    const positionId =
      normalizeNumericId(
        assignment.workplace_position_id ??
          assignment.workplacePositionId ??
          assignment.position_id ??
          assignment.positionId,
      ) ?? null;
    const positionName =
      typeof assignment.workplace_position_name === 'string'
        ? assignment.workplace_position_name.trim()
        : typeof assignment.workplacePositionName === 'string'
          ? assignment.workplacePositionName.trim()
          : typeof assignment.position_name === 'string'
            ? assignment.position_name.trim()
            : typeof assignment.positionName === 'string'
              ? assignment.positionName.trim()
              : null;
    normalizedPositions[workplaceId] = {
      positionId,
      positionName: positionName || null,
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

  const positionedAssignments = normalizedAssignments.map((assignment) => {
    if (!assignment || typeof assignment !== 'object') return assignment;
    const workplaceId = assignment.workplace_id;
    const mapped = workplaceId !== null ? normalizedPositions[workplaceId] : null;
    const positionId =
      assignment.workplace_position_id ??
      assignment.workplacePositionId ??
      assignment.position_id ??
      assignment.positionId ??
      mapped?.positionId ??
      null;
    const positionName =
      typeof assignment.workplace_position_name === 'string'
        ? assignment.workplace_position_name.trim()
        : typeof assignment.workplacePositionName === 'string'
          ? assignment.workplacePositionName.trim()
          : typeof assignment.position_name === 'string'
            ? assignment.position_name.trim()
            : typeof assignment.positionName === 'string'
              ? assignment.positionName.trim()
              : mapped?.positionName ??
                null;
    return {
      ...assignment,
      workplace_position_id: normalizeNumericId(positionId),
      workplacePositionId: normalizeNumericId(positionId),
      workplace_position_name: positionName || null,
      workplacePositionName: positionName || null,
    };
  });

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplace_position_id: normalizedWorkplacePositionId,
    workplace_position_name: normalizedWorkplacePositionName,
    workplace_assignments: positionedAssignments,
    workplace_session_ids: assignmentSessionIds,
    workplace_positions: normalizedPositions,
  };
}

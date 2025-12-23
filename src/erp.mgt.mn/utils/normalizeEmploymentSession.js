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

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return value;
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
    const workplacePositionId = normalizeNumericId(
      assignment.workplace_position_id ??
        assignment.workplacePositionId ??
        assignment.workplace_position,
    );
    if (workplaceId === null || sessionId === null) {
      return list;
    }

    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
      workplace_session_id: sessionId,
      workplace_position_id:
        workplacePositionId !== null
          ? workplacePositionId
          : assignment.workplace_position_id ?? assignment.workplacePositionId ?? null,
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

  const matchedAssignment =
    normalizedAssignments.find(
      (assignment) => assignment.workplace_session_id === fallbackSessionId,
    ) || null;

  const resolvedWorkplacePositionId =
    normalizeNumericId(
      session.workplace_position_id ??
        session.workplacePositionId ??
        session.workplace_position,
    ) ??
    normalizeNumericId(
      matchedAssignment?.workplace_position_id ??
        matchedAssignment?.workplacePositionId ??
        matchedAssignment?.workplace_position,
    );

  const resolvedWorkplacePositionName =
    trimOrNull(
      session.workplace_position_name ??
        session.workplacePositionName ??
        matchedAssignment?.workplace_position_name ??
        matchedAssignment?.workplacePositionName,
    ) ?? null;

  const resolvedEmploymentPositionName =
    trimOrNull(
      session.employment_position_name ??
        session.position_name ??
        session.positionName,
    ) ?? null;

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplace_assignments: normalizedAssignments,
    workplace_session_ids: assignmentSessionIds,
    workplace_position_id: resolvedWorkplacePositionId,
    workplace_position_name: resolvedWorkplacePositionName,
    employment_position_name: resolvedEmploymentPositionName,
  };
}

import { deriveWorkplacePositionsFromAssignments } from './workplaceResolver.js';

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

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
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

    const positionId = normalizeNumericId(
      assignment.workplace_position_id ??
        assignment.workplacePositionId ??
        assignment.position_id ??
        assignment.positionId ??
        assignment.position,
    );
    const positionName =
      normalizeText(
        assignment.workplace_position_name ??
          assignment.workplacePositionName ??
          assignment.position_name ??
          assignment.positionName,
      ) ?? null;

    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
      workplace_session_id: sessionId,
      workplace_position_id: positionId,
      workplacePositionId: positionId,
      workplace_position_name: positionName,
      workplacePositionName: positionName,
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

  const normalizedPositionId = normalizeNumericId(
    session.workplace_position_id ??
      session.workplacePositionId ??
      session.position_id ??
      session.positionId,
  );
  const normalizedPositionName = normalizeText(
    session.workplace_position_name ?? session.workplacePositionName,
  );
  const matchedAssignment =
    normalizedAssignments.find(
      (assignment) =>
        assignment.workplace_session_id === fallbackSessionId ||
        assignment.workplace_id === fallbackWorkplaceId,
    ) || null;
  const fallbackPositionId =
    normalizedPositionId ??
    normalizeNumericId(matchedAssignment?.workplace_position_id);
  const fallbackPositionName =
    normalizedPositionName ??
    normalizeText(matchedAssignment?.workplace_position_name) ??
    null;
  const workplacePositionMap = deriveWorkplacePositionsFromAssignments({
    workplace_assignments: normalizedAssignments,
  });

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplace_position_id: fallbackPositionId,
    workplacePositionId: fallbackPositionId,
    workplace_position_name: fallbackPositionName,
    workplacePositionName: fallbackPositionName,
    workplace_assignments: normalizedAssignments,
    workplace_session_ids: assignmentSessionIds,
    workplace_position_map: workplacePositionMap,
    workplacePositionMap: workplacePositionMap,
  };
}

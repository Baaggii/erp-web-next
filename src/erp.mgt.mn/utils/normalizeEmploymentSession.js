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

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplace_assignments: normalizedAssignments,
    workplace_session_ids: assignmentSessionIds,
  };
}

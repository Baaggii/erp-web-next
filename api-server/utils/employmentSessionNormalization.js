export function normalizeNumericId(value) {
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

export function normalizeWorkplaceAssignments(assignments = []) {
  const normalized = [];
  const sessionIds = [];

  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = normalizeNumericId(assignment.workplace_id);
    const rawSessionId =
      assignment.workplace_session_id !== undefined
        ? assignment.workplace_session_id
        : assignment.workplaceSessionId;
    const workplaceSessionId =
      normalizeNumericId(rawSessionId) ?? workplaceId ?? null;
    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
      workplace_session_id: workplaceSessionId,
    };
    normalized.push(normalizedAssignment);
    if (
      workplaceSessionId !== null &&
      !sessionIds.includes(workplaceSessionId)
    ) {
      sessionIds.push(workplaceSessionId);
    }
  });

  return { assignments: normalized, sessionIds };
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
    (normalizedAssignments.find((item) => item.workplace_id !== null)
      ?.workplace_id ?? null);
  const fallbackSessionId =
    normalizedSessionId ??
    fallbackWorkplaceId ??
    (sessionIds.length ? sessionIds[0] : null);

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplace_assignments: normalizedAssignments,
    workplace_session_ids: sessionIds,
  };
}

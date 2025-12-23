export function normalizeNumericId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
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
  const seen = new Set();

  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = normalizeNumericId(assignment.workplace_id);
    const rawSessionId =
      assignment.workplace_session_id !== undefined
        ? assignment.workplace_session_id
        : assignment.workplaceSessionId;
    const workplaceSessionId = normalizeNumericId(rawSessionId);
    const workplacePositionId = normalizeNumericId(
      assignment.workplace_position_id ??
        assignment.workplacePositionId ??
        assignment.workplace_position,
    );

    if (workplaceSessionId === null || workplaceId === null) return;

    const key = `${workplaceId ?? ''}|${workplaceSessionId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
      workplace_session_id: workplaceSessionId,
      workplace_position_id:
        workplacePositionId !== null
          ? workplacePositionId
          : assignment.workplace_position_id ?? assignment.workplacePositionId ?? null,
    };
    normalized.push(normalizedAssignment);
    if (!sessionIds.includes(workplaceSessionId)) {
      sessionIds.push(workplaceSessionId);
    }
  });

  return { assignments: normalized, sessionIds };
}

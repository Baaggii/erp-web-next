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
    const workplaceId = normalizeNumericId(
      assignment.workplace_id ?? assignment.workplaceId,
    );
    const workplacePositionId = normalizeNumericId(
      assignment.workplace_position_id ?? assignment.workplacePositionId,
    );
    const rawSessionId =
      assignment.workplace_session_id ??
      assignment.workplaceSessionId ??
      workplacePositionId ??
      assignment.workplace_id ??
      assignment.workplaceId;
    const workplaceSessionId = normalizeNumericId(rawSessionId);

    if (workplaceId === null && workplaceSessionId === null) return;

    const key = `${workplaceId ?? 'null'}|${workplaceSessionId ?? 'null'}`;
    if (seen.has(key)) return;
    seen.add(key);

    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
      workplace_session_id:
        workplaceSessionId ?? workplacePositionId ?? workplaceId,
    };
    if (workplacePositionId !== null) {
      normalizedAssignment.workplace_position_id = workplacePositionId;
    }
    normalized.push(normalizedAssignment);
    const resolvedSessionId =
      normalizedAssignment.workplace_session_id ?? workplaceId;
    if (resolvedSessionId !== null && !sessionIds.includes(resolvedSessionId)) {
      sessionIds.push(resolvedSessionId);
    }
  });

  return { assignments: normalized, sessionIds };
}

function normalizeKey(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : trimmed;
  }
  return null;
}

function normalizePositionValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function deriveWorkplacePositionMap({
  workplaceAssignments,
  sessionWorkplaceId,
  sessionWorkplacePositionId,
} = {}) {
  const map = {};
  const assignments = Array.isArray(workplaceAssignments) ? workplaceAssignments : [];
  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = normalizeKey(
      assignment.workplace_id ?? assignment.workplaceId ?? assignment.id,
    );
    const positionId = normalizePositionValue(
      assignment.workplace_position_id ??
        assignment.workplacePositionId ??
        assignment.position_id ??
        assignment.positionId ??
        assignment.position,
    );
    if (workplaceId === null || positionId === null) return;
    map[workplaceId] = positionId;
  });

  const fallbackWorkplace = normalizeKey(sessionWorkplaceId);
  const fallbackPosition = normalizePositionValue(sessionWorkplacePositionId);
  if (
    fallbackWorkplace !== null &&
    fallbackPosition !== null &&
    map[fallbackWorkplace] === undefined
  ) {
    map[fallbackWorkplace] = fallbackPosition;
  }

  return map;
}

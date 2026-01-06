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
  const seen = new Set();

  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = normalizeNumericId(
      assignment.workplace_id ?? assignment.workplaceId,
    );

    if (workplaceId === null) return;

    const key = `${workplaceId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
    };
    normalized.push(normalizedAssignment);
  });

  return { assignments: normalized };
}

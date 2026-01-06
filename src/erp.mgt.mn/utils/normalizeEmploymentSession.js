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
    if (workplaceId === null) {
      return list;
    }

    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
    };
    list.push(normalizedAssignment);
    return list;
  }, []);

  const normalizedWorkplaceId = normalizeNumericId(
    session.workplace_id ?? session.workplaceId,
  );

  const fallbackWorkplaceId =
    normalizedWorkplaceId ??
    normalizedAssignments.find((assignment) => assignment.workplace_id !== null)
      ?.workplace_id ??
    null;

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_assignments: normalizedAssignments,
  };
}

import { normalizeNumericId } from './workplaceAssignments.js';

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeWorkplaceId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : value.trim();
  }
  return value;
}

function normalizePositionId(value) {
  if (value === null || value === undefined) return null;
  const normalized = normalizeNumericId(value);
  if (normalized !== null) return normalized;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function deriveWorkplacePositionsFromAssignments(assignments = []) {
  const map = {};
  const list = Array.isArray(assignments) ? assignments : [];
  list.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = normalizeWorkplaceId(
      assignment.workplace_id ?? assignment.workplaceId ?? assignment.id,
    );
    if (workplaceId === null || workplaceId === undefined) return;
    const positionId = normalizePositionId(
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
      ) || null;
    map[workplaceId] = { positionId, positionName };
  });
  return map;
}

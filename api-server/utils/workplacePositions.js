import { pool } from '../../db/index.js';
import { normalizeEmploymentSession } from './employmentSession.js';
import { normalizeNumericId } from './workplaceAssignments.js';

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str || null;
}

function normalizeWorkplaceId(value) {
  const normalized = normalizeNumericId(value);
  return normalized === null ? null : normalized;
}

function normalizePositionId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
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

function buildMapFromAssignments(assignments = []) {
  const map = {};
  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = normalizeWorkplaceId(
      assignment.workplace_id ?? assignment.workplaceId ?? assignment.id,
    );
    if (workplaceId === null) return;
    const positionId = normalizePositionId(
      assignment.workplace_position_id ??
        assignment.workplacePositionId ??
        assignment.position_id ??
        assignment.positionId ??
        assignment.position ??
        null,
    );
    const positionName =
      normalizeText(
        assignment.workplace_position_name ??
          assignment.workplacePositionName ??
          assignment.position_name ??
          assignment.positionName,
      ) || null;
    map[workplaceId] = {
      positionId,
      positionName,
    };
  });
  return map;
}

function buildMapFromSessionPositions(workplacePositions = {}) {
  if (!workplacePositions || typeof workplacePositions !== 'object') {
    return {};
  }
  const map = {};
  Object.entries(workplacePositions).forEach(([workplaceKey, value]) => {
    const workplaceId = normalizeWorkplaceId(workplaceKey);
    if (workplaceId === null) return;
    if (value && typeof value === 'object') {
      const positionId = normalizePositionId(
        value.positionId ?? value.position_id ?? value.id ?? value.workplace_position_id,
      );
      const positionName =
        normalizeText(value.positionName ?? value.position_name ?? value.name) || null;
      map[workplaceId] = {
        positionId,
        positionName,
      };
      return;
    }
    const positionId = normalizePositionId(value);
    if (positionId !== null) {
      map[workplaceId] = { positionId, positionName: null };
    }
  });
  return map;
}

async function fetchWorkplacePositionMap(workplaceIds = [], companyId = null) {
  if (!Array.isArray(workplaceIds) || workplaceIds.length === 0) return {};
  const filteredIds = Array.from(
    new Set(
      workplaceIds
        .map((id) => normalizeWorkplaceId(id))
        .filter((id) => id !== null && id !== undefined),
    ),
  );
  if (!filteredIds.length) return {};
  const params = [...filteredIds];
  let sql = `
    SELECT
      cw.workplace_id AS workplace_id,
      cw.workplace_position_id AS workplace_position_id,
      cp.position_name AS position_name
    FROM code_workplace cw
    LEFT JOIN code_position cp ON cp.position_id = cw.workplace_position_id
    WHERE cw.workplace_id IN (${filteredIds.map(() => '?').join(',')})
  `;
  if (companyId !== null && companyId !== undefined) {
    sql += ' AND cw.company_id = ?';
    params.push(companyId);
  }
  try {
    const [rows] = await pool.query(sql, params);
    const map = {};
    rows.forEach((row) => {
      const workplaceId = normalizeWorkplaceId(row.workplace_id);
      if (workplaceId === null) return;
      map[workplaceId] = {
        positionId: normalizePositionId(row.workplace_position_id),
        positionName: normalizeText(row.position_name),
      };
    });
    return map;
  } catch (err) {
    console.warn('Failed to fetch workplace positions', err);
    return {};
  }
}

function mergePositionMaps(primary = {}, secondary = {}) {
  const merged = { ...secondary };
  Object.entries(primary || {}).forEach(([workplaceId, entry]) => {
    merged[workplaceId] = {
      positionId:
        entry?.positionId !== undefined && entry?.positionId !== null
          ? entry.positionId
          : secondary?.[workplaceId]?.positionId ?? null,
      positionName:
        entry?.positionName ??
        secondary?.[workplaceId]?.positionName ??
        null,
    };
  });
  return merged;
}

function hydrateAssignments(assignments = [], positionMap = {}) {
  return assignments.map((assignment) => {
    if (!assignment || typeof assignment !== 'object') return assignment;
    const workplaceId = normalizeWorkplaceId(
      assignment.workplace_id ?? assignment.workplaceId ?? assignment.id,
    );
    const mapped = workplaceId !== null ? positionMap[workplaceId] : null;
    const positionId =
      assignment.workplace_position_id ??
      assignment.workplacePositionId ??
      assignment.position_id ??
      assignment.positionId ??
      mapped?.positionId ??
      null;
    const positionName =
      normalizeText(
        assignment.workplace_position_name ??
          assignment.workplacePositionName ??
          assignment.position_name ??
          assignment.positionName,
      ) ??
      mapped?.positionName ??
      null;
    return {
      ...assignment,
      workplace_id: workplaceId,
      workplace_position_id: positionId,
      workplace_position_name: positionName,
    };
  });
}

export async function resolveWorkplacePositions({
  session,
  assignments = [],
  workplaceIds = [],
  companyId = null,
} = {}) {
  const normalizedAssignments = Array.isArray(assignments) ? assignments : [];
  const baseMap = buildMapFromAssignments(normalizedAssignments);
  const providedMap = buildMapFromSessionPositions(session?.workplace_positions);
  const combined = mergePositionMaps(baseMap, providedMap);
  const sessionCompanyId = companyId ?? session?.company_id ?? session?.companyId ?? null;

  const ids = new Set(workplaceIds);
  normalizedAssignments.forEach((assignment) => {
    ids.add(assignment?.workplace_id ?? assignment?.workplaceId ?? assignment?.id);
  });
  if (session?.workplace_id !== undefined && session?.workplace_id !== null) {
    ids.add(session.workplace_id);
  }
  if (session?.workplaceId !== undefined && session?.workplaceId !== null) {
    ids.add(session.workplaceId);
  }
  const missing = Array.from(ids).filter((id) => {
    const normalizedId = normalizeWorkplaceId(id);
    if (normalizedId === null) return false;
    const mapped = combined[normalizedId];
    return !mapped || mapped.positionId === null || mapped.positionId === undefined;
  });

  const fetched = await fetchWorkplacePositionMap(missing, sessionCompanyId);
  const positionMap = mergePositionMaps(combined, fetched);
  const hydratedAssignments = hydrateAssignments(normalizedAssignments, positionMap);
  const normalizedWorkplaceId = normalizeWorkplaceId(session?.workplace_id ?? session?.workplaceId);
  const workplacePositionId =
    (normalizedWorkplaceId !== null ? positionMap[normalizedWorkplaceId]?.positionId : null) ??
    session?.workplace_position_id ??
    session?.workplacePositionId ??
    null;

  return {
    positionMap,
    assignments: hydratedAssignments,
    workplacePositionId,
  };
}

export async function normalizeSessionWithPositions(session, assignments = []) {
  if (!session) return { session: null, positionMap: {} };
  const { positionMap, assignments: hydratedAssignments, workplacePositionId } =
    await resolveWorkplacePositions({
      session,
      assignments,
      companyId: session?.company_id ?? session?.companyId ?? null,
    });
  const normalizedSession = normalizeEmploymentSession(
    {
      ...session,
      workplace_positions: positionMap,
      workplace_position_id:
        session?.workplace_position_id ??
        session?.workplacePositionId ??
        workplacePositionId ??
        null,
    },
    hydratedAssignments,
  );
  return { session: normalizedSession, positionMap };
}

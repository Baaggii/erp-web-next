import { pool } from '../../db/index.js';
import { GLOBAL_COMPANY_ID } from '../../config/0/constants.js';
import { normalizeNumericId } from './workplaceAssignments.js';

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

export function buildWorkplacePositionMap(assignments = [], seed = {}) {
  const map = { ...(seed || {}) };
  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = normalizeNumericId(
      assignment.workplace_id ?? assignment.workplaceId ?? assignment.id,
    );
    if (workplaceId === null) return;
    const positionId = normalizeNumericId(
      assignment.workplace_position_id ??
        assignment.workplacePositionId ??
        assignment.position_id ??
        assignment.positionId ??
        assignment.position,
    );
    const positionName = normalizeText(
      assignment.workplace_position_name ??
        assignment.workplacePositionName ??
        assignment.position_name ??
        assignment.positionName,
    );
    const existing = map[workplaceId] || {};
    map[workplaceId] = {
      positionId: existing.positionId ?? positionId ?? null,
      positionName: existing.positionName ?? positionName ?? null,
    };
  });
  return map;
}

export function applyWorkplacePosition(assignment = {}, positionMap = {}) {
  const workplaceId = normalizeNumericId(
    assignment.workplace_id ?? assignment.workplaceId ?? assignment.id,
  );
  const mapped = workplaceId !== null ? positionMap[workplaceId] : null;
  const resolvedId = normalizeNumericId(
    mapped?.positionId ??
      assignment.workplace_position_id ??
      assignment.workplacePositionId ??
      assignment.position_id ??
      assignment.positionId ??
      assignment.position,
  );
  const resolvedName =
    normalizeText(mapped?.positionName) ??
    normalizeText(
      assignment.workplace_position_name ??
        assignment.workplacePositionName ??
        assignment.position_name ??
        assignment.positionName,
    );
  return {
    ...assignment,
    ...(resolvedId !== null
      ? {
          workplace_position_id: resolvedId,
          workplacePositionId: resolvedId,
        }
      : {}),
    ...(resolvedName
      ? {
          workplace_position_name: resolvedName,
          workplacePositionName: resolvedName,
        }
      : {}),
  };
}

export async function resolveWorkplacePositionsForAssignments(
  assignments = [],
  { companyId = null } = {},
) {
  const normalizedAssignments = Array.isArray(assignments) ? assignments : [];
  const workplaceIds = [];
  const companyIds = new Set();

  const normalizedCompanyId = normalizeNumericId(companyId);
  if (normalizedCompanyId !== null) {
    companyIds.add(normalizedCompanyId);
  }

  normalizedAssignments.forEach((assignment) => {
    const workplaceId = normalizeNumericId(
      assignment?.workplace_id ?? assignment?.workplaceId ?? assignment?.id,
    );
    if (workplaceId !== null) {
      workplaceIds.push(workplaceId);
    }
    const assignmentCompany = normalizeNumericId(
      assignment?.company_id ?? assignment?.companyId,
    );
    if (assignmentCompany !== null) {
      companyIds.add(assignmentCompany);
    }
  });

  const uniqueWorkplaceIds = Array.from(new Set(workplaceIds));
  const scopedCompanyIds = Array.from(
    new Set([GLOBAL_COMPANY_ID, ...Array.from(companyIds)]),
  );

  if (uniqueWorkplaceIds.length === 0) {
    const workplacePositionMap = buildWorkplacePositionMap(normalizedAssignments);
    return { assignments: normalizedAssignments, workplacePositionMap };
  }

  const workplacePlaceholders = uniqueWorkplaceIds.map(() => '?').join(',');
  const companyPlaceholders = scopedCompanyIds.map(() => '?').join(',');
  const params = [...uniqueWorkplaceIds, ...scopedCompanyIds];

  const [workplaceRows] = await pool.query(
    `
      SELECT workplace_id, workplace_position_id, workplace_name, workplace_ner, company_id
        FROM code_workplace
       WHERE workplace_id IN (${workplacePlaceholders})
         AND company_id IN (${companyPlaceholders})
         AND (deleted_at IS NULL OR deleted_at IN (0, ''))
    `.replace(/\s+/g, ' '),
    params,
  );

  const basePositionMap = {};
  const positionIds = new Set();
  workplaceRows.forEach((row) => {
    const workplaceId = normalizeNumericId(row.workplace_id);
    if (workplaceId === null) return;
    const positionId = normalizeNumericId(row.workplace_position_id);
    if (positionId !== null) {
      positionIds.add(positionId);
    }
    const positionName =
      normalizeText(row.workplace_name ?? row.workplace_ner) || null;
    basePositionMap[workplaceId] = {
      positionId,
      positionName,
    };
  });

  const companyParams = [...scopedCompanyIds];
  const resolvedPositionNames = {};
  if (positionIds.size > 0) {
    const positionPlaceholders = Array.from(positionIds).map(() => '?').join(',');
    const positionParams = [...Array.from(positionIds), ...companyParams];
    const [positionRows] = await pool.query(
      `
        SELECT position_id, position_name, company_id
          FROM code_position
         WHERE position_id IN (${positionPlaceholders})
           AND company_id IN (${companyPlaceholders})
           AND (deleted_at IS NULL OR deleted_at IN (0, ''))
      `.replace(/\s+/g, ' '),
      positionParams,
    );
    positionRows.forEach((row) => {
      const id = normalizeNumericId(row.position_id);
      if (id === null) return;
      const label = normalizeText(row.position_name ?? row.positionName);
      if (label) {
        resolvedPositionNames[id] = label;
      }
    });
  }

  Object.entries(basePositionMap).forEach(([workplaceId, info]) => {
    if (info.positionId !== null && resolvedPositionNames[info.positionId]) {
      basePositionMap[workplaceId] = {
        ...info,
        positionName: info.positionName ?? resolvedPositionNames[info.positionId],
      };
    }
  });

  const mergedMap = buildWorkplacePositionMap(normalizedAssignments, basePositionMap);
  const enrichedAssignments = normalizedAssignments.map((assignment) =>
    applyWorkplacePosition(assignment, mergedMap),
  );
  const workplacePositionMap = buildWorkplacePositionMap(
    enrichedAssignments,
    mergedMap,
  );

  return { assignments: enrichedAssignments, workplacePositionMap };
}


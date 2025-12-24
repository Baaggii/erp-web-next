import {
  normalizeNumericId,
  normalizeWorkplaceAssignments,
} from './workplaceAssignments.js';
import {
  applyWorkplacePosition,
  buildWorkplacePositionMap,
} from './workplacePositionResolver.js';

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return value;
}

function buildNormalizedAssignment(source = {}, defaults = {}, options = {}) {
  const { fallbackMeta = false } = options;
  const coalesce = (primary, fallback) =>
    primary !== undefined && primary !== null ? primary : fallback;

  const companyId = normalizeNumericId(
    coalesce(
      source.company_id ?? source.companyId,
      fallbackMeta ? defaults.company_id ?? defaults.companyId : null,
    ),
  );
  const companyName =
    trimOrNull(
      coalesce(
        source.company_name ?? source.companyName,
        fallbackMeta ? defaults.company_name ?? defaults.companyName : null,
      ),
    ) ?? null;

  const branchId = normalizeNumericId(
    coalesce(
      source.branch_id ?? source.branchId,
      fallbackMeta ? defaults.branch_id ?? defaults.branchId : null,
    ),
  );
  const branchName =
    trimOrNull(
      coalesce(
        source.branch_name ?? source.branchName,
        fallbackMeta ? defaults.branch_name ?? defaults.branchName : null,
      ),
    ) ?? null;

  const departmentId = normalizeNumericId(
    coalesce(
      source.department_id ?? source.departmentId,
      fallbackMeta ? defaults.department_id ?? defaults.departmentId : null,
    ),
  );
  const departmentName =
    trimOrNull(
      coalesce(
        source.department_name ?? source.departmentName,
        fallbackMeta ? defaults.department_name ?? defaults.departmentName : null,
      ),
    ) ?? null;

  const workplaceId = normalizeNumericId(
    coalesce(
      source.workplace_id ?? source.workplaceId,
      defaults.workplace_id ?? defaults.workplaceId,
    ),
  );
  const workplaceName =
    trimOrNull(
      coalesce(
        source.workplace_name ?? source.workplaceName,
        fallbackMeta ? defaults.workplace_name ?? defaults.workplaceName : null,
      ),
    ) ?? null;
  const workplaceSessionId = normalizeNumericId(
    coalesce(
      source.workplace_session_id ?? source.workplaceSessionId,
      defaults.workplace_session_id ??
        defaults.workplaceSessionId ??
        defaults.workplace_id ??
        defaults.workplaceId,
    ),
  );

  if (workplaceSessionId === null) {
    return null;
  }

  return {
    company_id: companyId,
    companyId: companyId,
    company_name: companyName,
    companyName: companyName,
    branch_id: branchId,
    branchId: branchId,
    branch_name: branchName,
    branchName: branchName,
    department_id: departmentId,
    departmentId: departmentId,
    department_name: departmentName,
    departmentName: departmentName,
    workplace_id: workplaceId,
    workplaceId: workplaceId,
    workplace_name: workplaceName,
    workplaceName: workplaceName,
    workplace_session_id: workplaceSessionId,
    workplaceSessionId: workplaceSessionId,
  };
}

export function normalizeEmploymentSession(
  session,
  assignments = [],
  workplacePositionMap = null,
) {
  if (!session || typeof session !== 'object') {
    return session ?? null;
  }

  const { assignments: normalizedAssignments, sessionIds } =
    normalizeWorkplaceAssignments(assignments);
  const normalizedWorkplaceId = normalizeNumericId(session.workplace_id);
  const normalizedSessionId = normalizeNumericId(session.workplace_session_id);
  const fallbackWorkplaceId =
    normalizedWorkplaceId ??
    (normalizedAssignments.find((item) => item.workplace_id !== null)?.workplace_id ??
      null);
  const fallbackSessionId =
    normalizedSessionId ?? (sessionIds.length ? sessionIds[0] : null);

  const basePositionMap = buildWorkplacePositionMap(
    normalizedAssignments,
    workplacePositionMap || {},
  );

  const fallbackDefaults = {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplaceId: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplaceSessionId: fallbackSessionId,
  };

  const hydratedAssignments = [];
  const assignmentKeys = new Set();
  normalizedAssignments.forEach((assignment) => {
    const normalizedAssignment = buildNormalizedAssignment(
      assignment,
      fallbackDefaults,
      { fallbackMeta: false },
    );
    if (!normalizedAssignment) {
      return;
    }
    const key = `${normalizedAssignment.workplaceId ?? 'null'}|${
      normalizedAssignment.workplaceSessionId ?? 'null'
    }`;
    if (assignmentKeys.has(key)) return;
    assignmentKeys.add(key);
    hydratedAssignments.push(
      applyWorkplacePosition(normalizedAssignment, basePositionMap),
    );
  });

  if (hydratedAssignments.length === 0 && fallbackSessionId !== null) {
    const fallbackAssignment = buildNormalizedAssignment(
      session,
      fallbackDefaults,
      { fallbackMeta: true },
    );
    if (fallbackAssignment) {
      const key = `${fallbackAssignment.workplaceId ?? 'null'}|${
        fallbackAssignment.workplaceSessionId ?? 'null'
      }`;
      if (!assignmentKeys.has(key)) {
        assignmentKeys.add(key);
        hydratedAssignments.push(
          applyWorkplacePosition(fallbackAssignment, basePositionMap),
        );
      }
    }
  }

  const combinedSessionIds = [...sessionIds];
  if (
    fallbackSessionId !== null &&
    !combinedSessionIds.includes(fallbackSessionId)
  ) {
    combinedSessionIds.push(fallbackSessionId);
  }

  const finalPositionMap = buildWorkplacePositionMap(
    hydratedAssignments,
    basePositionMap,
  );
  const resolvedWorkplacePositionId =
    finalPositionMap[fallbackWorkplaceId]?.positionId ?? null;
  const resolvedWorkplacePositionName =
    finalPositionMap[fallbackWorkplaceId]?.positionName ?? null;

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplace_assignments: hydratedAssignments,
    workplace_session_ids: combinedSessionIds,
    workplace_position_id: resolvedWorkplacePositionId,
    workplace_position_name: resolvedWorkplacePositionName ?? null,
    workplace_position_map: finalPositionMap,
  };
}

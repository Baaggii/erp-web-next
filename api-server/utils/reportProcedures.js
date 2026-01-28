import { listTransactionNames } from '../services/transactionFormConfig.js';
import { listAllowedReports } from '../services/reportAccessConfig.js';
import { getProcTriggers } from '../services/procTriggers.js';
import { getEmploymentSession, listReportProcedures } from '../../db/index.js';

const DRILLDOWN_ACCESS_TTL_MS = 15 * 60 * 1000;
const drilldownAccess = new Map();

function getAccessKey(user, companyId) {
  const userKey = user?.id ?? user?.empid ?? 'unknown';
  return `${companyId}:${userKey}`;
}

function normalizeProcedureNames(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeProcedureNames(entry));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

export function registerDrilldownProcedures(user, companyId, reportMeta) {
  if (!user || !companyId || !reportMeta) return;
  const drilldown = reportMeta?.drilldown;
  const candidates = [
    drilldown,
    drilldown?.fallbackProcedure,
    drilldown?.procedure,
    drilldown?.detailProcedure,
    drilldown?.report,
    reportMeta?.drilldownReport,
  ];
  const names = new Set();
  candidates.forEach((candidate) => {
    normalizeProcedureNames(candidate).forEach((name) => names.add(name));
  });
  if (!names.size) return;
  const now = Date.now();
  const key = getAccessKey(user, companyId);
  const existing = drilldownAccess.get(key) || new Map();
  names.forEach((name) => {
    existing.set(name, now + DRILLDOWN_ACCESS_TTL_MS);
  });
  drilldownAccess.set(key, existing);
}

export function isDrilldownAllowed(user, companyId, procedureName) {
  if (!user || !companyId || !procedureName) return false;
  const key = getAccessKey(user, companyId);
  const existing = drilldownAccess.get(key);
  if (!existing) return false;
  const now = Date.now();
  let allowed = false;
  for (const [name, expiresAt] of existing.entries()) {
    if (expiresAt <= now) {
      existing.delete(name);
      continue;
    }
    if (name === procedureName) {
      allowed = true;
    }
  }
  if (!existing.size) {
    drilldownAccess.delete(key);
  } else {
    drilldownAccess.set(key, existing);
  }
  return allowed;
}

async function getUserContext(user, companyId) {
  const session = await getEmploymentSession(user.empid, companyId);
  return {
    branchId: session?.branch_id,
    departmentId: session?.department_id,
    userLevelId: session?.user_level,
    workplaceId: session?.workplace_id,
    workplacePositionId: session?.workplace_position_id,
    workplacePositions: session?.workplace_assignments,
    positionId: session?.position_id ?? session?.employment_position_id,
  };
}

export async function listPermittedProcedures(
  { branchId, departmentId, prefix = '' } = {},
  companyId,
  user,
) {
  const userCtx = await getUserContext(user, companyId);
  const { names: forms, isDefault: formsDefault } = await listTransactionNames(
    {
      branchId,
      departmentId,
      userRightId: userCtx.userLevelId,
      workplaceId: userCtx.workplaceId,
      positionId: userCtx.positionId,
      workplacePositionId: userCtx.workplacePositionId,
      workplacePositions: userCtx.workplacePositions,
    },
    companyId,
  );
  const { config: allowedCfg, isDefault: accessDefault } =
    await listAllowedReports(companyId);
  const formProcs = new Set();
  const tables = new Set();
  Object.values(forms).forEach((info) => {
    if (!info) return;
    if (info.table) tables.add(info.table);
    if (Array.isArray(info.procedures)) {
      info.procedures.forEach((p) => formProcs.add(p));
    }
  });

  const triggerProcs = new Set();
  for (const table of tables) {
    if (!table) continue;
    try {
      const triggers = await getProcTriggers(table);
      Object.values(triggers || {}).forEach((configs) => {
        (configs || []).forEach((cfg) => {
          if (cfg?.name) triggerProcs.add(cfg.name);
        });
      });
    } catch (err) {
      // Ignore trigger lookup failures and continue with known procedures
    }
  }

  const allProcs = new Set([
    ...formProcs,
    ...triggerProcs,
    ...Object.keys(allowedCfg),
  ]);

  const liveProcedures = new Set(await listReportProcedures(prefix));

  const bId = Number(branchId ?? userCtx.branchId);
  const dId = Number(departmentId ?? userCtx.departmentId);
  const wId = Number(userCtx.workplaceId);
  const pId = Number(userCtx.positionId);
  const hasBranch = !Number.isNaN(bId);
  const hasDept = !Number.isNaN(dId);
  const hasWorkplace = !Number.isNaN(wId);
  const hasPosition = !Number.isNaN(pId);

  const list = [];
  for (const proc of allProcs) {
    if (!liveProcedures.has(proc)) continue;
    if (prefix && !proc.toLowerCase().includes(prefix.toLowerCase())) continue;
    const access = allowedCfg[proc];
    if (access) {
      const hasBranches = Array.isArray(access.branches)
        ? access.branches.length > 0
        : false;
      const hasDepartments = Array.isArray(access.departments)
        ? access.departments.length > 0
        : false;
      const hasWorkplaces = Array.isArray(access.workplaces)
        ? access.workplaces.length > 0
        : false;
      const hasPositions = Array.isArray(access.positions)
        ? access.positions.length > 0
        : false;
      const hasPermissions = Array.isArray(access.permissions)
        ? access.permissions.length > 0
        : false;

      if (
        !hasBranches &&
        !hasDepartments &&
        !hasWorkplaces &&
        !hasPositions &&
        !hasPermissions
      ) {
        // Configuration exists but no visibility rules were defined – hide it entirely.
        continue;
      }

      if (access.branches.length) {
        if (!hasBranch || !access.branches.includes(bId)) continue;
      }
      if (access.departments.length) {
        if (!hasDept || !access.departments.includes(dId)) continue;
      }
      if (access.workplaces.length) {
        if (!hasWorkplace || !access.workplaces.includes(wId)) continue;

        if (access.positions.length) {
          const wpPositions = Array.isArray(userCtx.workplacePositions)
            ? userCtx.workplacePositions
            : [];
          const hasWorkplacePosition = wpPositions.some((wp) =>
            access.positions.includes(wp?.position_id),
          );
          if (!hasWorkplacePosition) continue;
        }
      } else if (access.positions.length) {
        if (!hasPosition || !access.positions.includes(pId)) continue;
      }
      if (hasPermissions) {
        if (
          userCtx.userLevelId == null ||
          !access.permissions.includes(userCtx.userLevelId)
        )
          continue;
      }
    }
    let isDefault = true;
    if (formProcs.has(proc) && !formsDefault) isDefault = false;
    if (access && !accessDefault) isDefault = false;
    list.push({ name: proc, isDefault });
  }
  return { procedures: list, isDefault: formsDefault && accessDefault };
}

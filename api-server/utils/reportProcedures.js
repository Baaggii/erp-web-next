import { listTransactionNames } from '../services/transactionFormConfig.js';
import { listAllowedReports } from '../services/reportAccessConfig.js';
import { getProcTriggers } from '../services/procTriggers.js';
import { getEmploymentSession, listReportProcedures } from '../../db/index.js';

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

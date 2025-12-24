import { listTransactionNames } from '../services/transactionFormConfig.js';
import { listAllowedReports } from '../services/reportAccessConfig.js';
import { getProcTriggers } from '../services/procTriggers.js';
import {
  resolveEffectivePositions,
  resolveWorkplaceAssignmentsFromOptions,
} from '../../utils/accessControl.js';
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
  const normalizeAccessValue = (value) => {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    if (!str) return null;
    const num = Number(str);
    return Number.isFinite(num) ? num : str;
  };
  const normalizeList = (list) =>
    Array.isArray(list)
      ? list
          .map((val) => normalizeAccessValue(val))
          .filter((val) => val !== null)
      : [];

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
  const hasBranch = !Number.isNaN(bId);
  const hasDept = !Number.isNaN(dId);
  const hasWorkplace = !Number.isNaN(wId);
  const workplaceAssignments = resolveWorkplaceAssignmentsFromOptions(
    userCtx.workplaceId,
    {
      workplaceAssignments: userCtx.workplacePositions,
      workplacePositionId: userCtx.workplacePositionId,
    },
    normalizeAccessValue,
  );
  const resolvedPositions = resolveEffectivePositions({
    workplaceId: userCtx.workplaceId,
    employmentPositionId: userCtx.positionId,
    workplaceAssignments,
    normalizeValue: normalizeAccessValue,
  });

  const list = [];
  for (const proc of allProcs) {
    if (!liveProcedures.has(proc)) continue;
    if (prefix && !proc.toLowerCase().includes(prefix.toLowerCase())) continue;
    const access = allowedCfg[proc];
    if (access) {
      const accessBranches = normalizeList(access.branches);
      const accessDepartments = normalizeList(access.departments);
      const accessWorkplaces = normalizeList(access.workplaces);
      const accessPositions = normalizeList(access.positions);
      const accessPermissions = normalizeList(access.permissions);
      const hasBranches = accessBranches.length > 0;
      const hasDepartments = accessDepartments.length > 0;
      const hasWorkplaces = accessWorkplaces.length > 0;
      const hasPositions = accessPositions.length > 0;
      const hasPermissions = accessPermissions.length > 0;

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

      if (hasBranches) {
        if (!hasBranch || !accessBranches.includes(bId)) continue;
      }
      if (hasDepartments) {
        if (!hasDept || !accessDepartments.includes(dId)) continue;
      }
      if (hasWorkplaces && !resolvedPositions.workplaces.some((wp) => accessWorkplaces.includes(wp))) {
        continue;
      }
      if (hasPositions) {
        if (resolvedPositions.mode === 'deny') continue;
        if (!resolvedPositions.positions.some((pos) => accessPositions.includes(pos))) continue;
      } else if (hasWorkplaces && resolvedPositions.mode === 'deny') {
        continue;
      }
      if (hasPermissions) {
        if (
          userCtx.userLevelId == null ||
          !accessPermissions.includes(userCtx.userLevelId)
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

import { listTransactionNames } from '../services/transactionFormConfig.js';
import { listAllowedReports } from '../services/reportAccessConfig.js';
import { getProcTriggers } from '../services/procTriggers.js';
import {
  getEmploymentSession,
  getUserLevelActions,
  listReportProcedures,
} from '../../db/index.js';

async function getUserContext(user, companyId) {
  const session = await getEmploymentSession(user.empid, companyId);
  const userLevelId =
    user?.userLevel ?? user?.user_level ?? session?.user_level ?? null;
  const actions =
    userLevelId != null
      ? await getUserLevelActions(userLevelId, companyId)
      : {};
  const rightsSource =
    actions?.permissions && typeof actions.permissions === 'object'
      ? actions.permissions
      : session?.permissions && typeof session.permissions === 'object'
      ? session.permissions
      : {};
  const userRights = Object.entries(rightsSource)
    .filter(([, allowed]) => Boolean(allowed))
    .map(([key]) => key);
  return {
    branchId: session?.branch_id,
    departmentId: session?.department_id,
    userLevelId: session?.user_level,
    workplaceId: session?.workplace_id ?? session?.workplaceId ?? null,
    workplaceSessionId:
      session?.workplace_session_id ?? session?.workplaceSessionId ?? null,
    userRights,
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
      branchId: branchId ?? userCtx.branchId,
      departmentId: departmentId ?? userCtx.departmentId,
      userRights: userCtx.userRights,
      workplaceId: userCtx.workplaceId,
      workplaceSessionId: userCtx.workplaceSessionId,
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
  const hasBranch = !Number.isNaN(bId);
  const hasDept = !Number.isNaN(dId);

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
      const hasPermissions = Array.isArray(access.permissions)
        ? access.permissions.length > 0
        : false;

      if (!hasBranches && !hasDepartments && !hasPermissions) {
        // Configuration exists but no visibility rules were defined – hide it entirely.
        continue;
      }

      if (access.branches.length && hasBranch && !access.branches.includes(bId))
        continue;
      if (access.departments.length && hasDept && !access.departments.includes(dId))
        continue;
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

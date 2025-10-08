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
  };
}

export async function listPermittedProcedures(
  { branchId, departmentId, prefix = '' } = {},
  companyId,
  user,
) {
  const { names: forms, isDefault: formsDefault } = await listTransactionNames(
    { branchId, departmentId },
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

  const userCtx = await getUserContext(user, companyId);
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
      if (access.branches.length && hasBranch && !access.branches.includes(bId))
        continue;
      if (access.departments.length && hasDept && !access.departments.includes(dId))
        continue;
      if (
        access.permissions.length &&
        (userCtx.userLevelId == null ||
          !access.permissions.includes(userCtx.userLevelId))
      )
        continue;
    }
    let isDefault = true;
    if (formProcs.has(proc) && !formsDefault) isDefault = false;
    if (access && !accessDefault) isDefault = false;
    list.push({ name: proc, isDefault });
  }
  return { procedures: list, isDefault: formsDefault && accessDefault };
}

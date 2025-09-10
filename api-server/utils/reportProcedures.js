import { listTransactionNames } from '../services/transactionFormConfig.js';
import { listAllowedReports } from '../services/reportAccessConfig.js';
import { getEmploymentSession } from '../../db/index.js';

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
  Object.values(forms).forEach((info) => {
    if (Array.isArray(info?.procedures)) {
      info.procedures.forEach((p) => formProcs.add(p));
    }
  });
  const allProcs = new Set([...formProcs, ...Object.keys(allowedCfg)]);

  const userCtx = await getUserContext(user, companyId);
  const bId = Number(branchId ?? userCtx.branchId);
  const dId = Number(departmentId ?? userCtx.departmentId);
  const hasBranch = !Number.isNaN(bId);
  const hasDept = !Number.isNaN(dId);

  const list = [];
  for (const proc of allProcs) {
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

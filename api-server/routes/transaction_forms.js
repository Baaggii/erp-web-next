import express from 'express';
import {
  getFormConfig,
  getConfigsByTable,
  listTransactionNames,
  setFormConfig,
  deleteFormConfig,
  findTableByProcedure,
} from '../services/transactionFormConfig.js';
import { requireAuth } from '../middlewares/auth.js';
import { getEmploymentSession, getUserLevelActions } from '../../db/index.js';
import { pickScopeValue } from '../services/posTransactionConfig.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, name, moduleKey, branchId, departmentId, proc } = req.query;

    let accessContext = null;
    const resolveAccessContext = async () => {
      if (accessContext) return accessContext;
      const session =
        req.session && Number(req.session?.company_id) === companyId
          ? req.session
          : await getEmploymentSession(req.user.empid, companyId);
      const actions = await getUserLevelActions(req.user.userLevel, companyId);

      const sessionBranch =
        session?.branch_id ??
        session?.branchId ??
        req.session?.branch_id ??
        req.session?.branchId;
      const sessionDepartment =
        session?.department_id ??
        session?.departmentId ??
        req.session?.department_id ??
        req.session?.departmentId;
      const sessionWorkplace =
        session?.workplace_id ??
        session?.workplaceId ??
        req.session?.workplace_id ??
        req.session?.workplaceId;
      const sessionWorkplaceSession =
        session?.workplace_session_id ??
        session?.workplaceSessionId ??
        req.session?.workplace_session_id ??
        req.session?.workplaceSessionId;

      const resolvedBranchId = pickScopeValue(branchId, sessionBranch);
      const resolvedDepartmentId = pickScopeValue(
        departmentId,
        sessionDepartment,
      );
      const resolvedWorkplaceId = pickScopeValue(
        req.query.workplaceId ?? req.query.workplace_id,
        sessionWorkplace,
      );
      const resolvedWorkplaceSessionId = pickScopeValue(
        req.query.workplaceSessionId ?? req.query.workplace_session_id,
        sessionWorkplaceSession,
      );

      const rightsSource =
        actions?.permissions && typeof actions.permissions === 'object'
          ? actions.permissions
          : session?.permissions && typeof session.permissions === 'object'
          ? session.permissions
          : req.session?.permissions &&
            typeof req.session.permissions === 'object'
          ? req.session.permissions
          : {};
      const userRights = Object.entries(rightsSource)
        .filter(([, allowed]) => Boolean(allowed))
        .map(([key]) => key);

      accessContext = {
        branchId: resolvedBranchId,
        departmentId: resolvedDepartmentId,
        workplaceId: resolvedWorkplaceId,
        workplaceSessionId: resolvedWorkplaceSessionId,
        userRights,
      };
      return accessContext;
    };

    if (proc) {
      const { table: tbl, isDefault } = await findTableByProcedure(proc, companyId);
      if (tbl) res.json({ table: tbl, isDefault });
      else res.status(404).json({ message: 'Table not found', isDefault });
    } else if (table && name) {
      const { config, isDefault } = await getFormConfig(table, name, companyId);
      res.json({ ...config, isDefault });
    } else if (table) {
      const { config, isDefault } = await getConfigsByTable(table, companyId);
      res.json({ ...config, isDefault });
    } else {
      const ctx = await resolveAccessContext();
      const { names, isDefault } = await listTransactionNames(
        {
          moduleKey,
          branchId: ctx.branchId,
          departmentId: ctx.departmentId,
          userRights: ctx.userRights,
          workplaceId: ctx.workplaceId,
          workplaceSessionId: ctx.workplaceSessionId,
        },
        companyId,
      );
      res.json({ ...names, isDefault });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, name, config } = req.body;
    if (!table || !name)
      return res.status(400).json({ message: 'table and name are required' });
    await setFormConfig(table, name, config, {}, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, name } = req.query;
    if (!table || !name)
      return res.status(400).json({ message: 'table and name are required' });
    await deleteFormConfig(table, name, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

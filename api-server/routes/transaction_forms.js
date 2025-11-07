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
import { getEmploymentSession } from '../../db/index.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const {
      table,
      name,
      moduleKey,
      branchId,
      departmentId,
      proc,
      userRightId,
      workplaceId,
      procedure,
    } = req.query;
    let resolvedUserRight =
      userRightId ??
      req.user?.userLevel ??
      req.session?.user_level ??
      req.session?.userLevel ??
      null;
    let resolvedWorkplace =
      workplaceId ??
      req.session?.workplace_id ??
      req.session?.workplaceId ??
      req.session?.workplace ??
      null;
    if ((resolvedUserRight == null || resolvedWorkplace == null) && req.user?.empid) {
      try {
        const sessionInfo = await getEmploymentSession(req.user.empid, companyId);
        if (resolvedUserRight == null) {
          resolvedUserRight =
            sessionInfo?.user_level ?? sessionInfo?.userlevel_id ?? sessionInfo?.userLevel ?? null;
        }
        if (resolvedWorkplace == null) {
          resolvedWorkplace =
            sessionInfo?.workplace_id ?? sessionInfo?.workplaceId ?? sessionInfo?.workplace ?? null;
        }
      } catch {
        // ignore session lookup failures
      }
    }
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
      const { names, isDefault } = await listTransactionNames(
        {
          moduleKey,
          branchId,
          departmentId,
          userRightId: resolvedUserRight,
          workplaceId: resolvedWorkplace,
          procedure,
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

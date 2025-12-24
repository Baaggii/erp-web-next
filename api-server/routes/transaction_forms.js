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
import { deriveWorkplacePositionsFromAssignments } from '../utils/workplacePositions.js';
import { getEmploymentSession } from '../../db/index.js';
import { normalizeEmploymentSession } from '../utils/employmentSession.js';

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
      positionId,
      workplacePositionId,
    } =
      req.query;
    const baseSession =
      req.session && Number(req.session?.company_id) === companyId
        ? req.session
        : await getEmploymentSession(req.user.empid, companyId);
    const session =
      baseSession && !baseSession.workplace_assignments
        ? normalizeEmploymentSession(baseSession, baseSession ? [baseSession] : [])
        : baseSession || {};
    const resolvedWorkplacePositionId =
      workplacePositionId ??
      session?.workplace_position_id ??
      session?.workplacePositionId ??
      null;
    const workplacePositions = session?.workplace_assignments;
    const workplacePositionMap =
      session?.workplace_position_map ??
      session?.workplacePositionMap ??
      deriveWorkplacePositionsFromAssignments(workplacePositions);
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
          userRightId,
          workplaceId,
          positionId,
          workplacePositionId: resolvedWorkplacePositionId,
          workplacePositions,
          workplacePositionMap,
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

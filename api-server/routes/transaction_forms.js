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
import { deriveWorkplacePositionMap } from '../utils/workplacePositions.js';

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
      workplacePositionMap: workplacePositionMapRaw,
    } =
      req.query;
    const session = req.session || {};
    let workplacePositionMap = {};
    if (typeof workplacePositionMapRaw === 'string' && workplacePositionMapRaw.trim()) {
      try {
        const parsed = JSON.parse(workplacePositionMapRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          workplacePositionMap = parsed;
        }
      } catch {
        // ignore parse errors and fall back to derived map
      }
    }
    if (!workplacePositionMap || Object.keys(workplacePositionMap).length === 0) {
      workplacePositionMap = deriveWorkplacePositionMap({
        workplaceAssignments: session?.workplace_assignments,
        sessionWorkplaceId: session?.workplace_id ?? session?.workplaceId,
        sessionWorkplacePositionId:
          session?.workplace_position_id ?? session?.workplacePositionId,
      });
    }
    const resolvedWorkplaceId =
      workplaceId ?? session?.workplace_id ?? session?.workplaceId ?? null;
    const resolvedWorkplacePositionId =
      workplacePositionId ??
      workplacePositionMap?.[resolvedWorkplaceId] ??
      session?.workplace_position_id ??
      session?.workplacePositionId ??
      null;
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
          workplacePositions: session?.workplace_assignments,
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

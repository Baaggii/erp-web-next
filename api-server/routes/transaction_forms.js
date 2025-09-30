import express from 'express';
import {
  getFormConfig,
  getConfigsByTable,
  listTransactionNames,
  listAllTransactionConfigs,
  setFormConfig,
  deleteFormConfig,
  findTableByProcedure,
} from '../services/transactionFormConfig.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, name, moduleKey, branchId, departmentId, proc, mode } =
      req.query;
    if (proc) {
      const { table: tbl, isDefault } = await findTableByProcedure(proc, companyId);
      if (tbl) res.json({ table: tbl, isDefault });
      else res.status(404).json({ message: 'Table not found', isDefault });
    } else if (mode === 'all') {
      const { tables, isDefault } = await listAllTransactionConfigs(companyId);
      res.json({ tables, isDefault });
    } else if (table && name) {
      const { config, isDefault } = await getFormConfig(table, name, companyId);
      res.json({ ...config, isDefault });
    } else if (table) {
      const { config, isDefault } = await getConfigsByTable(table, companyId);
      res.json({ ...config, isDefault });
    } else {
      const { names, isDefault } = await listTransactionNames({ moduleKey, branchId, departmentId }, companyId);
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

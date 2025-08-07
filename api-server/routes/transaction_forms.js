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

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { table, name, moduleKey, branchId, departmentId, proc } = req.query;
    if (proc) {
      const tbl = await findTableByProcedure(proc);
      if (tbl) res.json({ table: tbl });
      else res.status(404).json({ message: 'Table not found' });
    } else if (table && name) {
      const cfg = await getFormConfig(table, name);
      res.json(cfg);
    } else if (table) {
      const all = await getConfigsByTable(table);
      res.json(all);
    } else {
      const names = await listTransactionNames({ moduleKey, branchId, departmentId });
      res.json(names);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { table, name, config } = req.body;
    if (!table || !name)
      return res.status(400).json({ message: 'table and name are required' });
    await setFormConfig(table, name, config);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const { table, name } = req.query;
    if (!table || !name)
      return res.status(400).json({ message: 'table and name are required' });
    await deleteFormConfig(table, name);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

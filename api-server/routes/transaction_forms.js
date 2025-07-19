import express from 'express';
import {
  getFormConfig,
  getConfigsByTable,
  listTransactionNames,
  setFormConfig,
  deleteFormConfig,
} from '../services/transactionFormConfig.js';
import { requireAuth, requireAdmin, requireRoles } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const { table, name, moduleKey, branchId, departmentId } = req.query;
    if (table && name) {
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

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
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

router.delete('/', requireAuth, requireAdmin, async (req, res, next) => {
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

import express from 'express';
import {
  getFormConfig,
  getConfigsByTable,
  listTransactionNames,
  setFormConfig,
  deleteFormConfig,
} from '../services/transactionFormConfig.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { table, name } = req.query;
    if (table && name) {
      const cfg = await getFormConfig(table, name);
      res.json(cfg);
    } else if (table) {
      const all = await getConfigsByTable(table);
      res.json(all);
    } else {
      const names = await listTransactionNames();
      res.json(names);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { table, name, config, showInSidebar, showInHeader } = req.body;
    if (!table || !name)
      return res.status(400).json({ message: 'table and name are required' });
    await setFormConfig(table, name, config || {}, {
      showInSidebar,
      showInHeader,
    });
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

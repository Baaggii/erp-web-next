import express from 'express';
import { getFormConfig, getAllFormConfigs, setFormConfig } from '../services/transactionFormConfig.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const table = req.query.table;
    if (table) {
      const cfg = await getFormConfig(table);
      res.json(cfg);
    } else {
      const all = await getAllFormConfigs();
      res.json(all);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { table, config } = req.body;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await setFormConfig(table, config || {});
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

import express from 'express';
import {
  getConfig,
  getAllConfigs,
  setConfig,
  deleteConfig,
} from '../services/codingTableConfig.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const table = req.query.table;
    if (table) {
      const cfg = await getConfig(table);
      res.json(cfg);
    } else {
      const all = await getAllConfigs();
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
    await setConfig(table, config || {});
    res.status(200).json({ message: 'Config saved successfully' });
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const table = req.query.table;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await deleteConfig(table);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

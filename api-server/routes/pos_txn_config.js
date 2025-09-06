import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getAllConfigs,
  getConfig,
  setConfig,
  deleteConfig,
} from '../services/posTransactionConfig.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const name = req.query.name;
    if (name) {
      const cfg = await getConfig(name, req.user.companyId);
      res.json(cfg || {});
    } else {
      const all = await getAllConfigs(req.user.companyId);
      res.json(all);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, config } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await setConfig(name, config || {}, req.user.companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const name = req.query.name;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await deleteConfig(name, req.user.companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

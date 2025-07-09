import express from 'express';
import { listConfigs, getConfig, setConfig, deleteConfig } from '../services/posTransConfig.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.query;
    if (name) {
      const cfg = await getConfig(name);
      res.json(cfg || {});
    } else {
      const all = await listConfigs();
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
    await setConfig(name, config || {});
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await deleteConfig(name);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

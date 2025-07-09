import express from 'express';
import { getPosConfig, setPosConfig, deletePosConfig } from '../services/posConfig.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const cfg = await getPosConfig();
    res.json(cfg);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    await setPosConfig(req.body.config || {});
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    await deletePosConfig();
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

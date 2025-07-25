import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getGeneralConfig,
  updateGeneralConfig,
} from '../services/generalConfig.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const cfg = await getGeneralConfig();
    res.json(cfg);
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    const cfg = await updateGeneralConfig(req.body || {});
    res.json(cfg);
  } catch (err) {
    next(err);
  }
});

export default router;

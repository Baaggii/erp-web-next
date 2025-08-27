import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getGeneralConfig, updateGeneralConfig } from '../services/generalConfig.js';
import { getEmploymentSession } from '../../db/index.js';

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
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (!session?.permissions?.system_settings) return res.sendStatus(403);
    const cfg = await updateGeneralConfig(req.body || {});
    res.json(cfg);
  } catch (err) {
    next(err);
  }
});

export default router;

import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getGeneralConfig, updateGeneralConfig } from '../services/generalConfig.js';
import { getEmploymentSession } from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { config, isDefault } = await getGeneralConfig(companyId);
    res.json({ ...config, isDefault });
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, companyId));
    const hasSystemSettings =
      session?.permissions?.system_settings ||
      (await hasAction(session, 'system_settings'));
    if (!hasSystemSettings) {
      const allowedKeys = new Set();
      if (await hasAction(session, 'Edit Field Labels')) {
        allowedKeys.add('procFieldLabels');
      }
      if (await hasAction(session, 'Edit label')) {
        allowedKeys.add('procLabels');
      }
      if (!allowedKeys.size) return res.sendStatus(403);
      const payload = req.body || {};
      const topLevelKeys = Object.keys(payload).filter((key) => key !== 'general');
      if (topLevelKeys.length) return res.sendStatus(403);
      const generalUpdates = payload.general || {};
      const invalidGeneralKeys = Object.keys(generalUpdates).filter(
        (key) => !allowedKeys.has(key),
      );
      if (invalidGeneralKeys.length) return res.sendStatus(403);
    }
    const cfg = await updateGeneralConfig(req.body || {}, companyId);
    res.json(cfg);
  } catch (err) {
    next(err);
  }
});

export default router;

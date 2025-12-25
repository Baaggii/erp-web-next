import express from 'express';
import {
  applySchemaChanges,
  buildSchemaDiff,
  getSchemaDiffStatus,
} from '../services/schemaDiff.js';
import { requireAuth } from '../middlewares/auth.js';
import { getEmploymentSession } from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

const router = express.Router();

async function requireSystemSettings(req, res, next) {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const session =
      req.session || (await getEmploymentSession(req.user.empid, companyId));
    if (!(await hasAction(session, 'system_settings'))) {
      return res.sendStatus(403);
    }
    req.session = session;
    req.companyId = companyId;
    return next();
  } catch (err) {
    return next(err);
  }
}

router.get('/status', requireAuth, requireSystemSettings, async (req, res, next) => {
  try {
    const status = await getSchemaDiffStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post('/build', requireAuth, requireSystemSettings, async (req, res, next) => {
  try {
    const { useCompareTool = false } = req.body || {};
    const diff = await buildSchemaDiff({ useCompareTool });
    res.json(diff);
  } catch (err) {
    next(err);
  }
});

router.post('/apply', requireAuth, requireSystemSettings, async (req, res, next) => {
  try {
    const { statements = [], allowDrops = false, dryRun = false } = req.body || {};
    const result = await applySchemaChanges(statements, { allowDrops, dryRun });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

import express from 'express';
import { exportTranslations } from '../services/translationsExport.js';
import { requireAuth } from '../middlewares/auth.js';
import { getEmploymentSession } from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

const router = express.Router();

async function checkPermission(req) {
  const session =
    req.session ||
    (await getEmploymentSession(req.user.empid, req.user.companyId));
  return hasAction(session, 'system_settings');
}

router.get('/export', requireAuth, async (req, res, next) => {
  try {
    if (!(await checkPermission(req))) return res.sendStatus(403);
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const data = await exportTranslations(companyId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;

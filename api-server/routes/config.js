import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { importConfigFiles } from '../services/configImport.js';
import { getEmploymentSession } from '../../db/index.js';

const router = express.Router();

router.post('/import/:type', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const session =
      req.session || (await getEmploymentSession(req.user.empid, companyId));
    if (!session?.permissions?.system_settings) return res.sendStatus(403);
    const type = req.params.type || '';
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    const results = await importConfigFiles(files, companyId, type);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;


import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { importConfigFiles } from '../services/configImport.js';

const router = express.Router();

router.post('/import/:type', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const type = req.params.type || '';
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    const results = await importConfigFiles(files, companyId, type);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;


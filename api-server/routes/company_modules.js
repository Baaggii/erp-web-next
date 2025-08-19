import express from 'express';
import { listLicenses, updateLicense } from '../controllers/companyModuleController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listLicenses);
router.put(
  '/',
  requireAuth,
  (req, res, next) => {
    res.locals.logTable = 'company_module_licenses';
    const { companyId, moduleKey } = req.body || {};
    if (companyId && moduleKey) {
      res.locals.logRecordId = `${companyId}-${moduleKey}`;
    }
    next();
  },
  updateLicense,
);
export default router;

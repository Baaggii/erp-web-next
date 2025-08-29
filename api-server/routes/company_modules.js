import express from 'express';
import { listLicenses, updateLicense } from '../controllers/companyModuleController.js';
import { requireAuth } from '../middlewares/auth.js';
import { setCompanyModuleLogId } from './logRecordId.js';

const router = express.Router();
router.get('/', requireAuth, listLicenses);
router.put('/', requireAuth, setCompanyModuleLogId, updateLicense);
export default router;

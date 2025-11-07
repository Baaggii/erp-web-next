import express from 'express';
import { getReportData, listReportWorkplaces } from '../controllers/reportController.js';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();
router.get('/workplaces', requireAuth, listReportWorkplaces);
router.get('/:reportId', requireAuth, getReportData);
export default router;

import express from 'express';
import { getReportData } from '../controllers/reportController.js';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();
router.get('/:reportId', requireAuth, getReportData);
export default router;
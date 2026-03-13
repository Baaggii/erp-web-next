import express from 'express';
import { getDashboardInit, getUserDashboard } from '../controllers/dashboardController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/init', requireAuth, getDashboardInit);
router.get('/', requireAuth, getUserDashboard);

export default router;

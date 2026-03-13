import express from 'express';
import { getUserDashboard } from '../controllers/dashboardController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, getUserDashboard);

export default router;

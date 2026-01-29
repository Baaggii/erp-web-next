import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getNotifications,
  getNotificationSummary,
  readNotifications,
} from '../controllers/notificationsController.js';

const router = express.Router();

router.get('/', requireAuth, getNotifications);
router.get('/summary', requireAuth, getNotificationSummary);
router.post('/read', requireAuth, readNotifications);

export default router;

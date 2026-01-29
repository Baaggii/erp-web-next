import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getNotifications,
  updateNotificationsRead,
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', requireAuth, getNotifications);
router.post('/read', requireAuth, updateNotificationsRead);

export default router;

import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listNotifications,
  markNotificationsRead,
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', requireAuth, listNotifications);
router.post('/read', requireAuth, markNotificationsRead);

export default router;

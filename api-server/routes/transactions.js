import express from 'express';
import rateLimit from 'express-rate-limit';
import { getTransactions } from '../controllers/transactionController.js';
import {
  listTransactionNotifications,
  markTransactionNotificationsRead,
  listUnifiedNotificationsFeed,
} from '../controllers/transactionNotificationController.js';

const router = express.Router();

const notificationsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for notifications
});

router.get('/', getTransactions);
router.get('/notifications', notificationsRateLimiter, listTransactionNotifications);
router.get('/notifications/feed', notificationsRateLimiter, listUnifiedNotificationsFeed);
router.post('/notifications/mark-read', markTransactionNotificationsRead);

export default router;

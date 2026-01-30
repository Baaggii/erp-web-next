import express from 'express';
import { getTransactions } from '../controllers/transactionController.js';
import {
  listTransactionNotifications,
  markTransactionNotificationsRead,
} from '../controllers/transactionNotificationController.js';

const router = express.Router();

router.get('/', getTransactions);
router.get('/notifications', listTransactionNotifications);
router.post('/notifications/mark-read', markTransactionNotificationsRead);

export default router;

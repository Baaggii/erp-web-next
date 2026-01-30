import express from 'express';
import {
  getTransactionNotifications,
  markTransactionNotificationReadHandler,
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/transactions', getTransactionNotifications);
router.post('/transactions/:id/read', markTransactionNotificationReadHandler);

export default router;

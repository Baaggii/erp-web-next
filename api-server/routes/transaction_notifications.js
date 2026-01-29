import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getTransactionNotificationSummary,
  listTransactionNotifications,
  markTransactionNotificationsRead,
} from '../services/transactionNotifications.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const data = await listTransactionNotifications({
      empid: req.user?.empid,
      limit,
      offset,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const data = await getTransactionNotificationSummary({
      empid: req.user?.empid,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/mark_read', requireAuth, async (req, res, next) => {
  try {
    const { ids = [], all = false } = req.body || {};
    const updated = await markTransactionNotificationsRead({
      empid: req.user?.empid,
      ids,
      markAll: Boolean(all),
    });
    res.json({ updated });
  } catch (err) {
    next(err);
  }
});

export default router;

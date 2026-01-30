import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listTransactionNotifications,
  markTransactionNotificationsRead,
} from '../services/transactionNotificationService.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = await listTransactionNotifications({
      empId: req.user.empid,
      companyId: req.user.companyId,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/mark-read', requireAuth, async (req, res, next) => {
  try {
    const ids = req.body?.ids || [];
    const updated = await markTransactionNotificationsRead({
      empId: req.user.empid,
      companyId: req.user.companyId,
      ids,
    });
    res.json({ updated });
  } catch (err) {
    next(err);
  }
});

export default router;

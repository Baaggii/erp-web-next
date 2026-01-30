import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listTransactionNotifications,
  getTransactionUnreadCount,
  markNotificationRead,
} from '../services/notificationService.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = req.query.page ?? 1;
    const perPage = req.query.perPage ?? req.query.per_page ?? 10;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unread_only === 'true';
    const empid = req.user?.empid;
    const result = await listTransactionNotifications({
      empid,
      page,
      perPage,
      unreadOnly,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const empid = req.user?.empid;
    const count = await getTransactionUnreadCount(empid);
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const empid = req.user?.empid;
    const updated = await markNotificationRead(req.params.id, empid);
    if (!updated) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

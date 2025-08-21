import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getUnreadResponseNotifications,
  markNotificationsRead,
} from '../services/notificationService.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await getUnreadResponseNotifications(req.user.empid);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/mark-seen', requireAuth, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await markNotificationsRead(req.user.empid, ids);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

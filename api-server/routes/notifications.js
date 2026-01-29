import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listNotifications,
  markNotificationsRead,
} from '../services/notificationService.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const limit = req.query.limit;
    const includeRead =
      req.query.includeRead !== 'false' && req.query.include_read !== 'false';
    const result = await listNotifications({
      recipientEmpId: req.user.empid,
      companyId,
      limit,
      includeRead,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/read', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];
    const markAll = req.body?.markAll === true || req.body?.mark_all === true;
    const result = await markNotificationsRead({
      recipientEmpId: req.user.empid,
      companyId,
      ids,
      markAll,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getNotificationsFeed } from '../services/notificationsFeed.js';

const router = express.Router();

router.get('/feed', requireAuth, async (req, res, next) => {
  try {
    const { limit, cursor } = req.query;
    const data = await getNotificationsFeed({
      empId: req.user.empid,
      companyId: req.user.companyId,
      limit,
      cursor,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;

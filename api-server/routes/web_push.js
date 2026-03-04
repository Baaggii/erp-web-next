import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getWebPushStatus,
  upsertWebPushSubscription,
  removeWebPushSubscription,
} from '../services/webPushService.js';

const router = Router();

router.use(requireAuth);

router.get('/status', async (req, res, next) => {
  try {
    const status = await getWebPushStatus({
      companyId: req.user.companyId,
      empid: req.user.empid,
    });
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post('/subscribe', async (req, res, next) => {
  try {
    const result = await upsertWebPushSubscription({
      companyId: req.user.companyId,
      empid: req.user.empid,
      subscription: req.body?.subscription,
      userAgent: req.get('user-agent') || '',
      notificationTypes: req.body?.notificationTypes,
      muteStartHour: req.body?.muteStartHour,
      muteEndHour: req.body?.muteEndHour,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/unsubscribe', async (req, res, next) => {
  try {
    const result = await removeWebPushSubscription({
      companyId: req.user.companyId,
      empid: req.user.empid,
      endpoint: req.body?.endpoint,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

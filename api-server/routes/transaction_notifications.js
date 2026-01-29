import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listTransactionNotifications } from '../services/transactionNotifications.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit = req.query.limit;
    const data = await listTransactionNotifications({
      empid: req.user.empid,
      companyId: req.user.companyId,
      limit,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;

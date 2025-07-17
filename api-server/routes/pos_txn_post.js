import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { addTransaction } from '../services/posTransactions.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, data, session } = req.body;
    if (!name || !data) return res.status(400).json({ message: 'invalid data' });
    const info = { ...(session || {}), userId: req.user.id };
    const rec = await addTransaction(name, data, info);
    res.json({ id: rec.id });
  } catch (err) {
    next(err);
  }
});

export default router;

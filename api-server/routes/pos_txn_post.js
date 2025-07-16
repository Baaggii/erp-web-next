import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { addTransaction } from '../services/posTransactions.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, data } = req.body;
    if (!name || !data) return res.status(400).json({ message: 'invalid data' });
    const rec = await addTransaction(name, data);
    res.json({ id: rec.id });
  } catch (err) {
    next(err);
  }
});

export default router;

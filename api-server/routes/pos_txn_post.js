import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { postPosTransaction } from '../services/postPosTransaction.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { data, session } = req.body;
    if (!data) return res.status(400).json({ message: 'invalid data' });
    const info = { ...(session || {}), userId: req.user.id };
    const id = await postPosTransaction(data, info, req.user.companyId);
    res.json({ id });
  } catch (err) {
    next(err);
  }
});

export default router;

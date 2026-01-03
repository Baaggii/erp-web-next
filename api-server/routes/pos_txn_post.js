import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { postPosTransaction } from '../services/postPosTransaction.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { name, data, session } = req.body;
    if (!data) return res.status(400).json({ message: 'invalid data' });
    const info = {
      ...(session || {}),
      userId: req.user.id,
      posNo: req.user.posNo ?? req.user.pos_no ?? null,
      branchNo: req.user.branchNo ?? null,
      pos_districtCode: req.user.posDistrictCode ?? req.user.pos_districtCode ?? null,
      merchantTin: req.user.merchantTin ?? null,
    };
    const id = await postPosTransaction(name, data, info, companyId);
    res.json({ id });
  } catch (err) {
    next(err);
  }
});

export default router;

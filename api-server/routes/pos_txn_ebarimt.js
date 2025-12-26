import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  issueSavedPosTransactionEbarimt,
  postPosTransactionWithEbarimt,
} from '../services/postPosTransaction.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { name, data, session, recordId, posApiRequestVariation } = req.body || {};
    const variationOverride =
      typeof posApiRequestVariation === 'string' ? posApiRequestVariation.trim() : null;
    const hasRecordId =
      recordId !== undefined && recordId !== null && `${recordId}`.trim() !== '';
    if (hasRecordId) {
      const result = await issueSavedPosTransactionEbarimt(
        name,
        recordId,
        companyId,
        { posApiRequestVariation: variationOverride },
      );
      res.json(result);
      return;
    }
    if (!data) return res.status(400).json({ message: 'invalid data' });
    const info = { ...(session || {}), userId: req.user.id };
    const result = await postPosTransactionWithEbarimt(
      name,
      data,
      info,
      companyId,
      { posApiRequestVariation: variationOverride },
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

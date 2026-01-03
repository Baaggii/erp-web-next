import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { issueDynamicTransactionEbarimt } from '../services/dynamicPosApi.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId ?? 0);
    const { table, formName, recordId } = req.body || {};
    const result = await issueDynamicTransactionEbarimt(
      table,
      formName,
      recordId,
      companyId,
      req.user,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

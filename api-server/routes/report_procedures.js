import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listTransactionNames } from '../services/transactionFormConfig.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { branchId, departmentId, prefix = '' } = req.query;
    const forms = await listTransactionNames({ branchId, departmentId });
    const set = new Set();
    Object.values(forms).forEach((info) => {
      if (Array.isArray(info.procedures)) {
        info.procedures.forEach((p) => {
          if (
            typeof p === 'string' &&
            (!prefix || p.toLowerCase().includes(prefix.toLowerCase()))
          ) {
            set.add(p);
          }
        });
      }
    });
    res.json({ procedures: Array.from(set) });
  } catch (err) {
    next(err);
  }
});

export default router;

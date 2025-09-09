import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listPermittedProcedures } from '../utils/reportProcedures.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { branchId, departmentId, prefix = '' } = req.query;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { procedures, isDefault } = await listPermittedProcedures(
      { branchId, departmentId, prefix },
      companyId,
      req.user,
    );
    res.json({ procedures, isDefault });
  } catch (err) {
    next(err);
  }
});

export default router;

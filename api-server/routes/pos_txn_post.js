import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { postPosTransaction } from '../services/postPosTransaction.js';
import { resolveScopedCompanyId, pickFirstScopeValue } from '../utils/requestScopes.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = resolveScopedCompanyId(
      req.query.companyId,
      req.user.companyId,
    );
    const { name, data, session } = req.body;
    if (!data) return res.status(400).json({ message: 'invalid data' });
    const info = { ...(session || {}), userId: req.user.id };
    const resolvedBranchId = pickFirstScopeValue(
      session?.branchId,
      session?.branch_id,
      session?.branch,
      req.user?.branchId,
      req.user?.branch_id,
      req.user?.branch,
    );
    const resolvedDepartmentId = pickFirstScopeValue(
      session?.departmentId,
      session?.department_id,
      session?.department,
      req.user?.departmentId,
      req.user?.department_id,
      req.user?.department,
    );
    if (resolvedBranchId !== null) info.branchId = resolvedBranchId;
    if (resolvedDepartmentId !== null) info.departmentId = resolvedDepartmentId;
    const id = await postPosTransaction(name, data, info, companyId);
    res.json({ id });
  } catch (err) {
    next(err);
  }
});

export default router;

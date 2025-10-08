import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { postPosTransaction } from '../services/postPosTransaction.js';
import {
  hasPosTransactionOperateAccess,
  pickScopeValue,
} from '../services/posTransactionConfig.js';
import { getEmploymentSession, getUserLevelActions } from '../../db/index.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { name, data, session } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    if (!data) return res.status(400).json({ message: 'invalid data' });

    const employmentSession =
      req.session && Number(req.session?.company_id) === companyId
        ? req.session
        : await getEmploymentSession(req.user.empid, companyId);
    const actions = await getUserLevelActions(req.user.userLevel, companyId);

    if (!hasPosTransactionOperateAccess(employmentSession, actions)) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    const providedSession = session && typeof session === 'object' ? session : {};
    const requestedBranch =
      providedSession.branchId ??
      providedSession.branch_id ??
      providedSession.branch ??
      undefined;
    const requestedDepartment =
      providedSession.departmentId ??
      providedSession.department_id ??
      providedSession.department ??
      undefined;

    const sessionBranch =
      employmentSession?.branch_id ??
      employmentSession?.branchId ??
      req.session?.branch_id ??
      req.session?.branchId;
    const sessionDepartment =
      employmentSession?.department_id ??
      employmentSession?.departmentId ??
      req.session?.department_id ??
      req.session?.departmentId;

    const branchId = pickScopeValue(requestedBranch, sessionBranch);
    const departmentId = pickScopeValue(requestedDepartment, sessionDepartment);

    const info = { ...providedSession, userId: req.user.id };
    if (branchId !== undefined && branchId !== null) {
      info.branchId = branchId;
      info.branch_id = branchId;
      info.branch = branchId;
    }
    if (departmentId !== undefined && departmentId !== null) {
      info.departmentId = departmentId;
      info.department_id = departmentId;
      info.department = departmentId;
    }
    if (info.companyId === undefined && info.company_id === undefined) {
      info.companyId = companyId;
    }

    const id = await postPosTransaction(name, data, info, companyId);
    res.json({ id });
  } catch (err) {
    next(err);
  }
});

export default router;

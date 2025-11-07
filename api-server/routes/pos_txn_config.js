import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getAllConfigs,
  getConfig,
  setConfig,
  deleteConfig,
  filterPosConfigsByAccess,
  hasPosTransactionAccess,
  hasPosConfigReadAccess,
  pickScopeValue,
} from '../services/posTransactionConfig.js';
import { getEmploymentSession, getUserLevelActions } from '../../db/index.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { name } = req.query;

    const session =
      req.session && Number(req.session?.company_id) === companyId
        ? req.session
        : await getEmploymentSession(req.user.empid, companyId);
    const actions = await getUserLevelActions(req.user.userLevel, companyId);

    if (!hasPosConfigReadAccess(session, actions)) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    const sessionBranch =
      session?.branch_id ??
      session?.branchId ??
      req.session?.branch_id ??
      req.session?.branchId;
    const sessionDepartment =
      session?.department_id ??
      session?.departmentId ??
      req.session?.department_id ??
      req.session?.departmentId;

    const sessionWorkplace =
      session?.workplace_id ??
      session?.workplaceId ??
      req.session?.workplace_id ??
      req.session?.workplaceId;
    const sessionWorkplaceSession =
      session?.workplace_session_id ??
      session?.workplaceSessionId ??
      req.session?.workplace_session_id ??
      req.session?.workplaceSessionId;

    const branchId = pickScopeValue(req.query.branchId, sessionBranch);
    const departmentId = pickScopeValue(
      req.query.departmentId,
      sessionDepartment,
    );
    const workplaceId = pickScopeValue(
      req.query.workplaceId ?? req.query.workplace_id,
      sessionWorkplace,
    );
    const workplaceSessionId = pickScopeValue(
      req.query.workplaceSessionId ?? req.query.workplace_session_id,
      sessionWorkplaceSession,
    );

    const rightsSource =
      actions?.permissions && typeof actions.permissions === 'object'
        ? actions.permissions
        : session?.permissions && typeof session.permissions === 'object'
        ? session.permissions
        : req.session?.permissions && typeof req.session.permissions === 'object'
        ? req.session.permissions
        : {};
    const userRights = Object.entries(rightsSource)
      .filter(([, allowed]) => Boolean(allowed))
      .map(([key]) => key);

    if (name) {
      const { config, isDefault } = await getConfig(name, companyId);
      if (!config) {
        res.status(404).json({ message: 'POS config not found', isDefault });
        return;
      }
      if (
        !hasPosTransactionAccess(config, branchId, departmentId, {
          userRights,
          workplaceId,
          workplaceSessionId,
        })
      ) {
        res.status(403).json({ message: 'Access denied', isDefault });
        return;
      }
      res.json({ ...config, isDefault });
    } else {
      const { config, isDefault } = await getAllConfigs(companyId);
      const filtered = filterPosConfigsByAccess(config, branchId, departmentId, {
        userRights,
        workplaceId,
        workplaceSessionId,
      });
      res.json({ ...filtered, isDefault });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { name, config } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await setConfig(name, config || {}, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const name = req.query.name;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await deleteConfig(name, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

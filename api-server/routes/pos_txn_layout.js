import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getLayout, getAllLayouts, setLayout } from '../services/posTransactionLayout.js';
import {
  getConfig,
  getAllConfigs,
  filterPosConfigsByAccess,
  hasPosTransactionAccess,
} from '../services/posTransactionConfig.js';
import { resolveScopedCompanyId, pickFirstScopeValue } from '../utils/requestScopes.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = resolveScopedCompanyId(
      req.query.companyId,
      req.user.companyId,
    );
    const name = req.query.name;
    const branchId = pickFirstScopeValue(
      req.query.branchId,
      req.query.branch_id,
      req.query.branch,
      req.user?.branchId,
      req.user?.branch_id,
      req.user?.branch,
    );
    const departmentId = pickFirstScopeValue(
      req.query.departmentId,
      req.query.department_id,
      req.query.department,
      req.user?.departmentId,
      req.user?.department_id,
      req.user?.department,
    );
    if (name) {
      const { config: posConfig } = await getConfig(name, companyId);
      if (!posConfig) {
        res.status(404).json({ message: 'POS config not found' });
        return;
      }
      if (!hasPosTransactionAccess(posConfig, branchId, departmentId)) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
      const cfg = await getLayout(name, companyId);
      res.json(cfg || {});
    } else {
      const { config: configMap } = await getAllConfigs(companyId);
      const allowedNames = filterPosConfigsByAccess(
        configMap,
        branchId,
        departmentId,
      );
      const allowedSet = new Set(Object.keys(allowedNames));
      const all = await getAllLayouts(companyId);
      if (!all || typeof all !== 'object') {
        res.json({});
        return;
      }
      const filteredLayouts = {};
      Object.entries(all).forEach(([layoutName, layoutValue]) => {
        if (allowedSet.has(layoutName)) {
          filteredLayouts[layoutName] = layoutValue;
        }
      });
      res.json(filteredLayouts);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = resolveScopedCompanyId(
      req.query.companyId,
      req.user.companyId,
    );
    const { name, layout } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await setLayout(name, layout || {}, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

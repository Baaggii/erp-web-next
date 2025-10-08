import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getAllConfigs,
  getConfig,
  setConfig,
  deleteConfig,
  filterPosConfigsByAccess,
  hasPosTransactionAccess,
} from '../services/posTransactionConfig.js';
import {
  resolveScopedCompanyId,
  pickFirstScopeValue,
} from '../utils/requestScopes.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = resolveScopedCompanyId(
      req.query.companyId,
      req.user.companyId,
    );
    const { name } = req.query;
    const branchId = pickFirstScopeValue(
      req.query.branchId,
      req.query.branch_id,
      req.query.branch,
    );
    const departmentId = pickFirstScopeValue(
      req.query.departmentId,
      req.query.department_id,
      req.query.department,
    );
    if (name) {
      const { config, isDefault } = await getConfig(name, companyId);
      if (!config) {
        res.status(404).json({ message: 'POS config not found', isDefault });
        return;
      }
      if (!hasPosTransactionAccess(config, branchId, departmentId)) {
        res.status(403).json({ message: 'Access denied', isDefault });
        return;
      }
      res.json({ ...config, isDefault });
    } else {
      const { config, isDefault } = await getAllConfigs(companyId);
      const filtered = filterPosConfigsByAccess(
        config,
        branchId,
        departmentId,
      );
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

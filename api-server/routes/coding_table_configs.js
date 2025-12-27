import express from 'express';
import {
  getConfig,
  getAllConfigs,
  setConfig,
  deleteConfig,
} from '../services/codingTableConfig.js';
import { requireAuth } from '../middlewares/auth.js';
import { ensureAdminResponse } from '../utils/admin.js';
import { getEmploymentSession } from '../../db/index.js';
import { ensureAdminResponse } from '../utils/admin.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: coding table configs change how data maps into DB tables.
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!ensureAdminResponse(req, res, { sessionPermissions: session?.permissions })) return;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const table = req.query.table;
    if (table) {
      const { config, isDefault } = await getConfig(table, companyId, {
        user: req.user,
        sessionPermissions: session?.permissions,
      });
      res.json({ ...config, isDefault });
    } else {
      const { config, isDefault } = await getAllConfigs(companyId, {
        user: req.user,
        sessionPermissions: session?.permissions,
      });
      res.json({ ...config, isDefault });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: writing configuration can alter column mappings and dynamic fields.
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!ensureAdminResponse(req, res, { sessionPermissions: session?.permissions })) return;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, config } = req.body;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await setConfig(table, config || {}, companyId, {
      user: req.user,
      sessionPermissions: session?.permissions,
    });
    res.status(200).json({ message: 'Config saved successfully' });
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: deleting configuration impacts table ingestion behaviour.
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!ensureAdminResponse(req, res, { sessionPermissions: session?.permissions })) return;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const table = req.query.table;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await deleteConfig(table, companyId, { user: req.user, sessionPermissions: session?.permissions });
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;

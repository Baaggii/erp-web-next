import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  callStoredProcedure,
  listStoredProcedures,
  getProcedureParams,
  getProcedureRawRows,
} from '../../db/index.js';
import { listPermittedProcedures } from '../utils/reportProcedures.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { prefix = '', branchId, departmentId } = req.query;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId, prefix },
      companyId,
      req.user,
    );
    const existing = new Set(await listStoredProcedures(prefix));
    const names = procedures
      .map((p) => p.name)
      .filter((n) => existing.has(n));
    res.json({ procedures: names });
  } catch (err) {
    next(err);
  }
});

router.get('/:name/params', requireAuth, async (req, res, next) => {
  try {
    const { branchId, departmentId } = req.query;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = new Set(procedures.map((p) => p.name));
    if (!allowed.has(req.params.name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    const parameters = await getProcedureParams(req.params.name);
    res.json({ parameters });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, params, aliases } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name required' });
    const { branchId, departmentId } = req.query;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = new Set(procedures.map((p) => p.name));
    if (!allowed.has(name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    const row = await callStoredProcedure(
      name,
      Array.isArray(params) ? params : [],
      Array.isArray(aliases) ? aliases : [],
    );
    res.json({ row });
  } catch (err) {
    next(err);
  }
});

router.post('/raw', requireAuth, async (req, res, next) => {
  try {
    const {
      name,
      params,
      column,
      groupField,
      groupValue,
      extraConditions,
      session,
    } = req.body || {};
    if (!name || !column)
      return res.status(400).json({ message: 'name and column required' });
    const { branchId, departmentId } = req.query;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = new Set(procedures.map((p) => p.name));
    if (!allowed.has(name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    const { rows, sql, original, file, displayFields } = await getProcedureRawRows(
      name,
      params || {},
      column,
      groupField,
      groupValue,
      Array.isArray(extraConditions) ? extraConditions : [],
      { ...(session || {}), empid: req.user?.empid },
    );
    res.json({ rows, sql, original, file, displayFields });
  } catch (err) {
    next(err);
  }
});

export default router;

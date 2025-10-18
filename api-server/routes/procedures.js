import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  callStoredProcedure,
  listStoredProcedures,
  getProcedureParams,
  getProcedureRawRows,
  getProcedureLockCandidates,
  getEmploymentSession,
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

router.post('/locks', requireAuth, async (req, res, next) => {
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
    const lockCandidates = await getProcedureLockCandidates(
      name,
      Array.isArray(params) ? params : [],
      Array.isArray(aliases) ? aliases : [],
      { companyId },
    );
    res.json({ lockCandidates });
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
    const sessionPayload = {
      ...(session || {}),
      empid: req.user?.empid,
    };

    let needsWorkplace = false;
    try {
      const parameters = await getProcedureParams(name);
      needsWorkplace = parameters.some(
        (param) => typeof param === 'string' && param.toLowerCase() === 'session_workplace_id',
      );
    } catch {
      /* ignore lookup failures; we'll fall back to existing payload */
    }

    if (needsWorkplace && sessionPayload.workplace_id == null && req.user?.empid) {
      const sessionCompanyId =
        sessionPayload.company_id ??
        sessionPayload.companyId ??
        companyId ??
        req.user?.companyId ??
        null;
      const sessionBranchId =
        sessionPayload.branch_id ?? sessionPayload.branch ?? branchId ?? undefined;
      const sessionDepartmentId =
        sessionPayload.department_id ?? sessionPayload.department ?? departmentId ?? undefined;
      try {
        const resolved = await getEmploymentSession(req.user.empid, sessionCompanyId, {
          branchId: sessionBranchId,
          departmentId: sessionDepartmentId,
        });
        if (resolved?.workplace_id != null) {
          sessionPayload.workplace_id = resolved.workplace_id;
          if (sessionPayload.workplace == null) {
            sessionPayload.workplace = resolved.workplace_id;
          }
          if (sessionPayload.workplace_name == null && resolved.workplace_name != null) {
            sessionPayload.workplace_name = resolved.workplace_name;
          }
        }
      } catch {
        /* ignore lookup errors; continue with whatever we have */
      }
    }

    const { rows, sql, original, file, displayFields } = await getProcedureRawRows(
      name,
      params || {},
      column,
      groupField,
      groupValue,
      Array.isArray(extraConditions) ? extraConditions : [],
      sessionPayload,
    );
    res.json({ rows, sql, original, file, displayFields });
  } catch (err) {
    next(err);
  }
});

export default router;

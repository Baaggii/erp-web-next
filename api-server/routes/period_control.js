import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  closeFiscalPeriod,
  getPeriodStatus,
  previewFiscalPeriodReports,
  requirePeriodClosePermission,
  saveFiscalPeriodReportSnapshot,
  listFiscalPeriodReportSnapshots,
  getFiscalPeriodReportSnapshot,
} from '../services/periodControlService.js';

function validateStatusQuery(req) {
  if (req.query.company_id !== undefined) {
    const companyId = Number(req.query.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) return 'company_id must be a positive integer';
  }
  if (req.query.fiscal_year !== undefined) {
    const fiscalYear = Number(req.query.fiscal_year);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 3000) return 'fiscal_year is invalid';
  }
  return null;
}

function validateClosePayload(req) {
  const companyId = Number(req.body.company_id);
  const fiscalYear = Number(req.body.fiscal_year);
  const reportProcedures = req.body.report_procedures;

  if (!Number.isInteger(companyId) || companyId <= 0) return 'company_id is required';
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 3000) return 'fiscal_year is invalid';
  if (!Array.isArray(reportProcedures) || reportProcedures.length === 0) {
    return 'report_procedures must be a non-empty array';
  }
  if (reportProcedures.some((item) => typeof item !== 'string' || !item.trim())) {
    return 'report_procedures values must be non-empty strings';
  }
  return null;
}

function validatePreviewPayload(req) {
  return validateClosePayload(req);
}

export function createPeriodControlRouter(deps = {}) {
  const router = express.Router();
  const authMiddleware = deps.requireAuth || requireAuth;
  const getStatus = deps.getPeriodStatus || getPeriodStatus;
  const closePeriod = deps.closeFiscalPeriod || closeFiscalPeriod;
  const previewReports = deps.previewFiscalPeriodReports || previewFiscalPeriodReports;
  const permissionCheck = deps.requirePeriodClosePermission || requirePeriodClosePermission;
  const saveSnapshot = deps.saveFiscalPeriodReportSnapshot || saveFiscalPeriodReportSnapshot;
  const listSnapshots = deps.listFiscalPeriodReportSnapshots || listFiscalPeriodReportSnapshots;
  const getSnapshot = deps.getFiscalPeriodReportSnapshot || getFiscalPeriodReportSnapshot;

  router.get('/status', authMiddleware, async (req, res) => {
    const validationMessage = validateStatusQuery(req);
    if (validationMessage) return res.status(400).json({ ok: false, message: validationMessage });

    try {
      const companyId = Number(req.query.company_id || req.user.companyId);
      const fiscalYear = Number(req.query.fiscal_year || new Date().getFullYear());
      const period = await getStatus(companyId, fiscalYear);
      return res.json({ ok: true, period });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to load period status' });
    }
  });

  router.post('/close', authMiddleware, async (req, res) => {
    const validationMessage = validateClosePayload(req);
    if (validationMessage) return res.status(400).json({ ok: false, message: validationMessage });

    try {
      const { allowed } = await permissionCheck(req);
      if (!allowed) return res.sendStatus(403);

      const result = await closePeriod({
        companyId: Number(req.body.company_id),
        fiscalYear: Number(req.body.fiscal_year),
        userId: req.user.empid || req.user.id || req.user.email,
        reportProcedures: req.body.report_procedures,
      });

      return res.json({
        ok: true,
        nextFiscalYear: result.nextFiscalYear,
        openingJournalId: result.openingJournalId,
      });
    } catch (error) {
      const statusCode = /already closed/i.test(String(error?.message || '')) ? 409 : 500;
      return res.status(statusCode).json({ ok: false, message: error?.message || 'Failed to close period' });
    }
  });

  router.post('/preview', authMiddleware, async (req, res) => {
    const validationMessage = validatePreviewPayload(req);
    if (validationMessage) return res.status(400).json({ ok: false, message: validationMessage });

    try {
      const { allowed } = await permissionCheck(req);
      if (!allowed) return res.sendStatus(403);

      const results = await previewReports({
        companyId: Number(req.body.company_id),
        fiscalYear: Number(req.body.fiscal_year),
        reportProcedures: req.body.report_procedures,
      });
      return res.json({ ok: true, results });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to preview reports' });
    }
  });


  router.post('/snapshot', authMiddleware, async (req, res) => {
    const companyId = Number(req.body.company_id);
    const fiscalYear = Number(req.body.fiscal_year);
    const procedureName = String(req.body.procedure_name || '').trim();
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ ok: false, message: 'company_id is required' });
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 3000) return res.status(400).json({ ok: false, message: 'fiscal_year is invalid' });
    if (!procedureName) return res.status(400).json({ ok: false, message: 'procedure_name is required' });

    try {
      const { allowed } = await permissionCheck(req);
      if (!allowed) return res.sendStatus(403);
      const snapshot = await saveSnapshot({
        companyId,
        fiscalYear,
        procedureName,
        rows,
        createdBy: req.user.empid || req.user.id || req.user.email,
      });
      return res.json({ ok: true, snapshot });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to save snapshot' });
    }
  });

  router.get('/snapshots', authMiddleware, async (req, res) => {
    const companyId = Number(req.query.company_id || req.user.companyId);
    const fiscalYear = Number(req.query.fiscal_year || new Date().getFullYear());
    if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ ok: false, message: 'company_id is required' });
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 3000) return res.status(400).json({ ok: false, message: 'fiscal_year is invalid' });
    try {
      const { allowed } = await permissionCheck(req);
      if (!allowed) return res.sendStatus(403);
      const snapshots = await listSnapshots({ companyId, fiscalYear });
      return res.json({ ok: true, snapshots });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to list snapshots' });
    }
  });

  router.get('/snapshots/:snapshotId', authMiddleware, async (req, res) => {
    const snapshotId = Number(req.params.snapshotId);
    const companyId = Number(req.query.company_id || req.user.companyId);
    const page = Number(req.query.page || 1);
    const perPage = Number(req.query.per_page || 200);
    if (!Number.isInteger(snapshotId) || snapshotId <= 0) return res.status(400).json({ ok: false, message: 'snapshotId is invalid' });
    if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ ok: false, message: 'company_id is required' });
    try {
      const { allowed } = await permissionCheck(req);
      if (!allowed) return res.sendStatus(403);
      const snapshot = await getSnapshot({ snapshotId, companyId, page, perPage });
      if (!snapshot) return res.status(404).json({ ok: false, message: 'Snapshot not found' });
      return res.json({ ok: true, snapshot });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to load snapshot' });
    }
  });

  return router;
}

export default createPeriodControlRouter();

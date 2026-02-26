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
  deleteFiscalPeriodReportSnapshot,
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

function validateSnapshotSavePayload(req) {
  const companyId = Number(req.body.company_id);
  const fiscalYear = Number(req.body.fiscal_year);
  const procedureName = String(req.body.procedure_name || '').trim();
  const rows = req.body.rows;
  const reportMeta = req.body.report_meta;
  const reportParams = req.body.report_params;

  if (!Number.isInteger(companyId) || companyId <= 0) return 'company_id is required';
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 3000) return 'fiscal_year is invalid';
  if (!procedureName) return 'procedure_name is required';
  if (!Array.isArray(rows)) return 'rows must be an array';
  if (reportMeta !== undefined && (typeof reportMeta !== 'object' || Array.isArray(reportMeta))) return 'report_meta must be an object';
  if (reportParams !== undefined && (typeof reportParams !== 'object' || Array.isArray(reportParams))) return 'report_params must be an object';
  return null;
}

function validateSnapshotListQuery(req) {
  if (req.query.company_id === undefined) return 'company_id is required';
  if (req.query.fiscal_year === undefined) return 'fiscal_year is required';
  return validateStatusQuery(req);
}

function validateSnapshotGetQuery(req) {
  if (req.query.company_id === undefined) return 'company_id is required';
  const companyId = Number(req.query.company_id);
  const page = Number(req.query.page || 1);
  const perPage = Number(req.query.per_page || 200);
  if (!Number.isInteger(companyId) || companyId <= 0) return 'company_id must be a positive integer';
  if (!Number.isInteger(page) || page <= 0) return 'page must be a positive integer';
  if (!Number.isInteger(perPage) || perPage <= 0 || perPage > 2000) return 'per_page must be between 1 and 2000';
  return null;
}

function validateSnapshotDeleteQuery(req) {
  if (req.query.company_id === undefined) return 'company_id is required';
  const companyId = Number(req.query.company_id);
  if (!Number.isInteger(companyId) || companyId <= 0) return 'company_id must be a positive integer';
  return null;
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
  const deleteSnapshot = deps.deleteFiscalPeriodReportSnapshot || deleteFiscalPeriodReportSnapshot;

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
    const validationMessage = validateSnapshotSavePayload(req);
    if (validationMessage) return res.status(400).json({ ok: false, message: validationMessage });

    try {
      const { allowed } = await permissionCheck(req);
      if (!allowed) return res.sendStatus(403);

      const result = await saveSnapshot({
        companyId: Number(req.body.company_id),
        fiscalYear: Number(req.body.fiscal_year),
        procedureName: String(req.body.procedure_name).trim(),
        rows: Array.isArray(req.body.rows) ? req.body.rows : [],
        reportMeta: req.body.report_meta && typeof req.body.report_meta === 'object' && !Array.isArray(req.body.report_meta) ? req.body.report_meta : {},
        reportParams: req.body.report_params && typeof req.body.report_params === 'object' && !Array.isArray(req.body.report_params) ? req.body.report_params : {},
        createdBy: req.user.empid || req.user.id || req.user.email,
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to save snapshot' });
    }
  });

  router.get('/snapshots', authMiddleware, async (req, res) => {
    const validationMessage = validateSnapshotListQuery(req);
    if (validationMessage) return res.status(400).json({ ok: false, message: validationMessage });

    try {
      const snapshots = await listSnapshots({
        companyId: Number(req.query.company_id),
        fiscalYear: Number(req.query.fiscal_year),
      });
      return res.json({ ok: true, snapshots });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to load snapshots' });
    }
  });

  router.get('/snapshots/:snapshotId', authMiddleware, async (req, res) => {
    const validationMessage = validateSnapshotGetQuery(req);
    if (validationMessage) return res.status(400).json({ ok: false, message: validationMessage });

    const snapshotId = Number(req.params.snapshotId);
    if (!Number.isInteger(snapshotId) || snapshotId <= 0) {
      return res.status(400).json({ ok: false, message: 'snapshotId is invalid' });
    }

    try {
      const snapshot = await getSnapshot({
        snapshotId,
        companyId: Number(req.query.company_id),
        page: Number(req.query.page || 1),
        perPage: Number(req.query.per_page || 200),
      });
      if (!snapshot) return res.status(404).json({ ok: false, message: 'Snapshot not found' });
      return res.json({ ok: true, snapshot });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to load snapshot' });
    }
  });

  router.delete('/snapshots/:snapshotId', authMiddleware, async (req, res) => {
    const validationMessage = validateSnapshotDeleteQuery(req);
    if (validationMessage) return res.status(400).json({ ok: false, message: validationMessage });

    const snapshotId = Number(req.params.snapshotId);
    if (!Number.isInteger(snapshotId) || snapshotId <= 0) {
      return res.status(400).json({ ok: false, message: 'snapshotId is invalid' });
    }

    try {
      const { allowed } = await permissionCheck(req);
      if (!allowed) return res.sendStatus(403);

      const result = await deleteSnapshot({
        snapshotId,
        companyId: Number(req.query.company_id),
      });
      if (!result?.deleted) return res.status(404).json({ ok: false, message: 'Snapshot not found' });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error?.message || 'Failed to delete snapshot' });
    }
  });

  return router;
}

export default createPeriodControlRouter();

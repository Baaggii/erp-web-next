import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  closeFiscalPeriod,
  getCurrentPeriodStatus,
  requirePeriodClosePermission,
} from '../services/periodControlService.js';

const router = express.Router();

router.get('/status', requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.company_id || req.user.companyId);
    const fiscalYear = Number(req.query.fiscal_year || new Date().getFullYear());
    const status = await getCurrentPeriodStatus({ companyId, fiscalYear });
    return res.json({ ok: true, period: status });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error?.message || 'Failed to load period status' });
  }
});

router.post('/close', requireAuth, async (req, res) => {
  try {
    const { allowed } = await requirePeriodClosePermission(req);
    if (!allowed) return res.sendStatus(403);

    const companyId = Number(req.body.company_id || req.user.companyId);
    const fiscalYear = Number(req.body.fiscal_year || new Date().getFullYear());
    const reportProcedures = Array.isArray(req.body.report_procedures) ? req.body.report_procedures : [];

    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ ok: false, message: 'company_id is required' });
    }
    if (!Number.isFinite(fiscalYear) || fiscalYear < 1900 || fiscalYear > 3000) {
      return res.status(400).json({ ok: false, message: 'fiscal_year is invalid' });
    }

    const result = await closeFiscalPeriod({
      companyId,
      fiscalYear,
      userId: req.user.empid || req.user.id || req.user.email,
      reportProcedures,
    });
    return res.json(result);
  } catch (error) {
    const statusCode = /already closed/i.test(String(error?.message || '')) ? 409 : 500;
    return res.status(statusCode).json({ ok: false, message: error?.message || 'Failed to close period' });
  }
});

export default router;

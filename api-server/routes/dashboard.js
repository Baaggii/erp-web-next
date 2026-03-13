import express from 'express';
import { getUserDashboard } from '../controllers/dashboardController.js';
import { requireAuth } from '../middlewares/auth.js';
import { listModules } from '../../db/index.js';
import { listCompanyModuleLicenses } from '../../db/index.js';
import { listTransactionNames } from '../services/transactionFormConfig.js';
import { listAllowedReports } from '../services/reportAccessConfig.js';
import { listReportProcedures } from '../../db/index.js';

const router = express.Router();

router.get('/', requireAuth, getUserDashboard);

router.get('/init', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const [modules, companyModules, transactionForms, allowedReportConfig] = await Promise.all([
      listModules(req.user.userLevel, req.user.companyId),
      listCompanyModuleLicenses(companyId, req.user.empid),
      listTransactionNames(
        {
          workplacePositionId:
            req.session?.workplace_position_id ?? req.session?.workplacePositionId ?? null,
          workplacePositions: req.session?.workplace_assignments,
        },
        companyId,
      ),
      listAllowedReports(companyId),
    ]);

    const liveProcedures = new Set(await listReportProcedures());
    const filteredAllowedReports = Object.fromEntries(
      Object.entries(allowedReportConfig?.config || {}).filter(([name]) => liveProcedures.has(name)),
    );

    res.json({
      modules: Array.isArray(modules) ? modules : [],
      companyModules: Array.isArray(companyModules) ? companyModules : [],
      transactionForms: transactionForms?.names || {},
      reportAccess: {
        allowedReports: filteredAllowedReports,
        isDefault: Boolean(allowedReportConfig?.isDefault),
        reportApprovalsDashboardTab: allowedReportConfig?.reportApprovalsDashboardTab || 'audition',
      },
      dashboardSections: {
        report: allowedReportConfig?.reportApprovalsDashboardTab || 'audition',
        change:
          transactionForms?.names?.changeRequestsDashboardTab ||
          transactionForms?.names?.change_requests_dashboard_tab ||
          'audition',
        temporary:
          transactionForms?.names?.temporaryTransactionsDashboardTab ||
          transactionForms?.names?.temporary_transactions_dashboard_tab ||
          'audition',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

import { fetchDashboard } from '../services/dashboardService.js';
import { listModules } from '../../db/index.js';
import { listTransactionNames } from '../services/transactionFormConfig.js';
import { listAllowedReports } from '../services/reportAccessConfig.js';

export async function getUserDashboard(req, res, next) {
  try {
    const data = await fetchDashboard(req.user.empid, req.user.companyId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getDashboardInit(req, res, next) {
  try {
    const companyId = Number(req.user.companyId);
    const [modules, transactionForms, reportAccess] = await Promise.all([
      listModules(req.user.userLevel, companyId),
      listTransactionNames(
        {
          branchId: req.query.branchId,
          departmentId: req.query.departmentId,
          userRightId: req.query.userRightId,
          workplaceId: req.query.workplaceId,
          positionId: req.query.positionId,
          workplacePositionId: req.query.workplacePositionId,
          workplacePositions: req.session?.workplace_assignments,
        },
        companyId,
      ).then((r) => r?.names || {}),
      listAllowedReports(companyId).then((r) => ({
        allowedReports: r?.config || {},
        isDefault: r?.isDefault,
        reportApprovalsDashboardTab: r?.reportApprovalsDashboardTab,
      })),
    ]);

    res.json({
      modules: Array.isArray(modules) ? modules : [],
      transactionForms: transactionForms || {},
      reportAccess: reportAccess || {},
      dashboardSections: null,
    });
  } catch (err) {
    next(err);
  }
}

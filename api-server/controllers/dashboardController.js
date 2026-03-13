import { fetchDashboard } from '../services/dashboardService.js';

export async function getUserDashboard(req, res, next) {
  try {
    const data = await fetchDashboard(req.user.empid, req.user.companyId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

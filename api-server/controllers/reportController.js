import { fetchReportData } from '../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';

// Controller to handle fetching report data by ID
export async function getReportData(req, res, next) {
  try {
    const { reportId } = req.params;
    const data = await fetchReportData(reportId, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
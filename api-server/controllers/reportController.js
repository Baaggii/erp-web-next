import { fetchReportData } from '../../db/index.js';
export async function getReportData(req, res, next) {
  try {
    const data = await fetchReportData(req.params.reportId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
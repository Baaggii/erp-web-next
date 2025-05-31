import { listCompanies } from '../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';

export async function listCompaniesHandler(req, res, next) {
  try {
    const companies = await listCompanies();
    res.json(companies);
  } catch (err) {
    next(err);
  }
}

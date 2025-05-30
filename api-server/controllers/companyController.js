import { findAllCompanies } from '../db/index.js';
export async function listCompanies(req, res, next) {
  try {
    const companies = await findAllCompanies();
    res.json(companies);
  } catch (err) {
    next(err);
  }
}
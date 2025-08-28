import {
  listCompanies,
  insertTableRow,
  getEmploymentSession,
} from '../../db/index.js';

export async function listCompaniesHandler(req, res, next) {
  try {
    const companies = await listCompanies();
    res.json(companies);
  } catch (err) {
    next(err);
  }
}

export async function createCompanyHandler(req, res, next) {
  try {
    res.locals.logTable = 'companies';
    const { seedTables = null, ...company } = req.body || {};
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (!session?.permissions?.system_settings) return res.sendStatus(403);
    const result = await insertTableRow('companies', company, seedTables);
    res.locals.insertId = result?.id;
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

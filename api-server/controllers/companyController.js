import {
  listCompanies,
  insertTableRow,
  assignCompanyToUser,
  getEmploymentSession,
  getEmploymentSessions,
} from '../../db/index.js';

export async function listCompaniesHandler(req, res, next) {
  try {
    const companies = await listCompanies(req.user.empid);
    res.json(companies);
  } catch (err) {
    next(err);
  }
}

export async function createCompanyHandler(req, res, next) {
  try {
    res.locals.logTable = 'companies';
    const {
      seedTables = null,
      seedRecords = null,
      overwrite = false,
      ...company
    } = req.body || {};
    company.created_by = req.user.empid;
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    // A user might belong to multiple employment sessions across companies.
    // If the current session lacks `system_settings`, allow the request when
    // *any* of the user's sessions grants that permission.
    if (!session?.permissions?.system_settings) {
      const sessions = await getEmploymentSessions(req.user.empid);
      if (!sessions.some((s) => s.permissions?.system_settings)) {
        return res.sendStatus(403);
      }
    }
    const result = await insertTableRow(
      'companies',
      company,
      seedTables,
      seedRecords,
      overwrite,
      req.user.empid,
    );
    res.locals.insertId = result?.id;
    if (result?.id) {
      await assignCompanyToUser(req.user.empid, result.id, null, null, req.user.empid);
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

import {
  listCompanies,
  insertTableRow,
  updateTableRow,
  deleteTableRowCascade,
  getEmploymentSession,
  getUserLevelActions,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

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
    const body = req.body || {};
    const { seedTables, seedRecords, overwrite = false, ...company } = body;
    company.created_by = req.user.empid;
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (!(await hasAction(session, 'system_settings'))) {
      const actions = await getUserLevelActions(req.user.userLevel);
      if (!actions?.permissions?.system_settings) {
        return res.sendStatus(403);
      }
    }
    const shouldSeed =
      Object.prototype.hasOwnProperty.call(body, 'seedTables') ||
      Object.prototype.hasOwnProperty.call(body, 'seedRecords');
    const result = shouldSeed
      ? await insertTableRow(
          'companies',
          company,
          seedTables,
          seedRecords,
          overwrite,
          req.user.empid,
        )
      : await insertTableRow('companies', company);
    res.locals.insertId = result?.id;
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateCompanyHandler(req, res, next) {
  try {
    res.locals.logTable = 'companies';
    const updates = { ...req.body };
    delete updates.created_by;
    delete updates.created_at;
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (!(await hasAction(session, 'system_settings'))) {
      const actions = await getUserLevelActions(req.user.userLevel);
      if (!actions?.permissions?.system_settings) {
        return res.sendStatus(403);
      }
    }
    await updateTableRow('companies', req.params.id, updates);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function deleteCompanyHandler(req, res, next) {
  try {
    res.locals.logTable = 'companies';
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (!(await hasAction(session, 'system_settings'))) {
      const actions = await getUserLevelActions(req.user.userLevel);
      if (!actions?.permissions?.system_settings) {
        return res.sendStatus(403);
      }
    }
    await deleteTableRowCascade('companies', req.params.id, req.params.id);
    res.sendStatus(204);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

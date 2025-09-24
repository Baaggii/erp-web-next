import {
  listCompanyModuleLicenses,
  setCompanyModuleLicense,
  getEmploymentSession,
  listCompanies,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

export async function listLicenses(req, res, next) {
  try {
    const companyId = req.query.companyId;
    const licenses = await listCompanyModuleLicenses(
      companyId,
      req.user.empid,
    );
    res.json(licenses);
  } catch (err) {
    next(err);
  }
}

export async function updateLicense(req, res, next) {
  try {
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (!(await hasAction(session, 'license_settings'))) {
      return res.sendStatus(403);
    }
    const { companyId, moduleKey, licensed } = req.body;
    const companies = await listCompanies(req.user.empid);
    if (!companies.some((c) => c.id === Number(companyId))) {
      return res.sendStatus(403);
    }
    await setCompanyModuleLicense(
      companyId,
      moduleKey,
      licensed,
      req.user.empid,
    );
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

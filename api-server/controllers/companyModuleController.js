import {
  listCompanyModuleLicenses,
  setCompanyModuleLicense,
  getEmploymentSession,
} from '../../db/index.js';

export async function listLicenses(req, res, next) {
  try {
    const companyId = req.query.companyId;
    const licenses = await listCompanyModuleLicenses(companyId);
    res.json(licenses);
  } catch (err) {
    next(err);
  }
}

export async function updateLicense(req, res, next) {
  try {
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!session?.permissions?.system_settings) {
      return res.sendStatus(403);
    }
    const { companyId, moduleKey, licensed } = req.body;
    await setCompanyModuleLicense(companyId, moduleKey, licensed);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

export function setCompanyModuleLogId(req, res, next) {
  res.locals.logTable = 'company_module_licenses';
  const { companyId, moduleKey } = req.body || {};
  if (companyId != null && moduleKey) {
    res.locals.logRecordId = `${companyId}-${moduleKey}`;
  }
  next();
}


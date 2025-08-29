export function setCompanyModuleLogId(req, res, next) {
  res.locals.logTable = 'company_module_licenses';
  const { companyId, moduleKey } = req.body || {};
  if (companyId != null && moduleKey) {
    res.locals.logRecordId = `${companyId}-${moduleKey}`;
  }
  next();
}

export function setUserCompanyLogId(req, res, next) {
  res.locals.logTable = 'user_companies';
  const { empid, companyId } = req.body || {};
  if (empid != null && companyId != null) {
    res.locals.logRecordId = `${empid}-${companyId}`;
  }
  next();
}

export function normalizeAccessValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function normalizeAccessList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const normalized = [];
  list.forEach((item) => {
    const val = normalizeAccessValue(item);
    if (val !== null) normalized.push(val);
  });
  return normalized;
}

function matchesScope(list, value) {
  if (!Array.isArray(list) || list.length === 0) return true;
  const normalizedValue = normalizeAccessValue(value);
  if (normalizedValue === null) return true;
  return list.includes(normalizedValue);
}

function pickOptionValue(options = {}, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      return options[key];
    }
  }
  return undefined;
}

export function hasPosTransactionAccess(info, branchId, departmentId, options = {}) {
  if (!info || typeof info !== 'object') return true;
  const branchValue = normalizeAccessValue(branchId);
  const departmentValue = normalizeAccessValue(departmentId);
  const userRightValue = normalizeAccessValue(
    pickOptionValue(options, [
      'userRightId',
      'userRight',
      'userLevelId',
      'userlevel_id',
      'userlevelId',
      'user_level',
      'userLevel',
    ]),
  );
  const workplaceValue = normalizeAccessValue(
    pickOptionValue(options, [
      'workplaceId',
      'workplace_id',
      'workplaceSessionId',
      'workplace_session_id',
      'workplace',
    ]),
  );
  const procedureValue = normalizeAccessValue(
    pickOptionValue(options, ['procedure', 'procedureName', 'procedureId']),
  );

  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);
  const allowedUserRights = normalizeAccessList(info.allowedUserRights);
  const allowedWorkplaces = normalizeAccessList(info.allowedWorkplaces);
  const allowedProcedures = normalizeAccessList(info.procedures);
  const generalAllowed =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue) &&
    matchesScope(allowedUserRights, userRightValue) &&
    matchesScope(allowedWorkplaces, workplaceValue) &&
    matchesScope(allowedProcedures, procedureValue);

  if (generalAllowed) return true;

  const temporaryEnabled = Boolean(
    info.supportsTemporarySubmission ??
      info.allowTemporarySubmission ??
      info.supportsTemporary ??
      false,
  );
  if (!temporaryEnabled) return false;

  const temporaryBranches = normalizeAccessList(info.temporaryAllowedBranches);
  const temporaryDepartments = normalizeAccessList(
    info.temporaryAllowedDepartments,
  );
  const temporaryUserRights = normalizeAccessList(
    info.temporaryAllowedUserRights,
  );
  const temporaryWorkplaces = normalizeAccessList(
    info.temporaryAllowedWorkplaces,
  );
  const temporaryProcedures = normalizeAccessList(info.temporaryProcedures);

  return (
    matchesScope(temporaryBranches, branchValue) &&
    matchesScope(temporaryDepartments, departmentValue) &&
    matchesScope(temporaryUserRights, userRightValue) &&
    matchesScope(temporaryWorkplaces, workplaceValue) &&
    matchesScope(temporaryProcedures, procedureValue)
  );
}

export function filterPosConfigsByAccess(
  configMap = {},
  branchId,
  departmentId,
  options = {},
) {
  const filtered = {};
  Object.entries(configMap || {}).forEach(([name, cfg]) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (hasPosTransactionAccess(cfg, branchId, departmentId, options)) {
      filtered[name] = cfg;
    }
  });
  return filtered;
}

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
  if (normalizedValue === null) return false;
  return list.includes(normalizedValue);
}

export function hasPosTransactionAccess(info, branchId, departmentId) {
  if (!info || typeof info !== 'object') return true;
  const allowedBranches = normalizeAccessList(info.allowedBranches);
  const allowedDepartments = normalizeAccessList(info.allowedDepartments);
  return (
    matchesScope(allowedBranches, branchId) &&
    matchesScope(allowedDepartments, departmentId)
  );
}

export function filterPosConfigsByAccess(configMap = {}, branchId, departmentId) {
  const filtered = {};
  Object.entries(configMap || {}).forEach(([name, cfg]) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (hasPosTransactionAccess(cfg, branchId, departmentId)) {
      filtered[name] = cfg;
    }
  });
  return filtered;
}

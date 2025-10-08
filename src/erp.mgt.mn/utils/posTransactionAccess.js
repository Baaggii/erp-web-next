import {
  normalizeAccessValue,
  hasTransactionFormAccess,
} from './transactionFormAccess.js';

export { normalizeAccessValue };

export function hasPosTransactionAccess(info, branchId, departmentId) {
  return hasTransactionFormAccess(info, branchId, departmentId);
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

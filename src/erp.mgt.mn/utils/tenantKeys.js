export function getTenantKeyList(info) {
  if (!info || typeof info !== 'object') return [];
  const direct = Array.isArray(info.tenantKeys) ? info.tenantKeys : null;
  const legacy = Array.isArray(info.tenant_keys) ? info.tenant_keys : null;
  const source = direct ?? legacy ?? [];
  const keys = [];
  for (const key of source) {
    if (typeof key !== 'string') continue;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function normalizeSharedFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return false;
    if (['1', 'true', 't', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'f', 'no', 'n', 'off'].includes(normalized)) return false;
    return Boolean(normalized);
  }
  return false;
}

export function isTenantTableShared(info) {
  if (!info || typeof info !== 'object') return false;
  const raw =
    info.isShared ??
    info.is_shared ??
    info.shared ??
    info.sharedTenant ??
    info.shared_tenant ??
    null;
  if (raw === null || raw === undefined) return false;
  return normalizeSharedFlag(raw);
}

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

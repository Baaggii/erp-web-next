import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

export function tenantConfigPath(file, companyId = 0) {
  return path.join(process.cwd(), 'config', String(companyId), file);
}

export async function getConfigPath(file, companyId = 0) {
  const tenant = tenantConfigPath(file, companyId);
  try {
    await fs.access(tenant);
    return { path: tenant, isDefault: false };
  } catch {
    return { path: tenantConfigPath(file, 0), isDefault: true };
  }
}

export function getConfigPathSync(file, companyId = 0) {
  const tenant = tenantConfigPath(file, companyId);
  return existsSync(tenant)
    ? { path: tenant, isDefault: false }
    : { path: tenantConfigPath(file, 0), isDefault: true };
}

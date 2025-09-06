import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

export function tenantConfigPath(file, companyId = 0) {
  return path.join(process.cwd(), 'config', String(companyId), file);
}

export async function resolveConfigPath(file, companyId = 0) {
  const tenant = tenantConfigPath(file, companyId);
  try {
    await fs.access(tenant);
    return tenant;
  } catch {
    return tenantConfigPath(file, 0);
  }
}

export function resolveConfigPathSync(file, companyId = 0) {
  const tenant = tenantConfigPath(file, companyId);
  return existsSync(tenant) ? tenant : tenantConfigPath(file, 0);
}

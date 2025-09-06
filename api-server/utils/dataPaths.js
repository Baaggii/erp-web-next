import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

export function tenantDataPath(file, companyId = 0) {
  return path.join(process.cwd(), 'api-server', 'data', String(companyId), file);
}

export async function resolveDataPath(file, companyId = 0) {
  const tenant = tenantDataPath(file, companyId);
  try {
    await fs.access(tenant);
    return tenant;
  } catch {
    return tenantDataPath(file, 0);
  }
}

export function resolveDataPathSync(file, companyId = 0) {
  const tenant = tenantDataPath(file, companyId);
  return existsSync(tenant) ? tenant : tenantDataPath(file, 0);
}

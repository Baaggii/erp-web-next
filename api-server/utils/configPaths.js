import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveConfigBasePath() {
  const fromEnv = process.env.CONFIG_BASE_PATH || process.env.CONFIG_ROOT;
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
  }
  return path.resolve(__dirname, '../..', 'config');
}

const CONFIG_BASE_PATH = resolveConfigBasePath();

export function getConfigBasePath() {
  return CONFIG_BASE_PATH;
}

export function tenantConfigRoot(companyId = 0) {
  return path.join(CONFIG_BASE_PATH, String(companyId));
}

export function tenantConfigPath(file, companyId = 0) {
  return path.join(tenantConfigRoot(companyId), file);
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

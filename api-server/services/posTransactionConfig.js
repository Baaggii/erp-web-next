import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

  async function readConfig(companyId = 0) {
    const { path: filePath, isDefault } = await getConfigPath(
      'posTransactionConfig.json',
      companyId,
    );
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return { cfg: JSON.parse(data), isDefault };
    } catch {
      return { cfg: {}, isDefault: true };
    }
  }

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath('posTransactionConfig.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getConfig(name, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg[name] || null, isDefault };
}

export async function getAllConfigs(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg, isDefault };
}

export async function setConfig(name, config = {}, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  cfg[name] = config;
  await writeConfig(cfg, companyId);
  return cfg[name];
}

export async function deleteConfig(name, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  delete cfg[name];
  await writeConfig(cfg, companyId);
}

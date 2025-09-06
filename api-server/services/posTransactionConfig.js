import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, resolveConfigPath } from '../utils/configPaths.js';

async function readConfig(companyId = 0) {
  try {
    const filePath = await resolveConfigPath('posTransactionConfig.json', companyId);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath('posTransactionConfig.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getConfig(name, companyId = 0) {
  const cfg = await readConfig(companyId);
  return cfg[name] || null;
}

export async function getAllConfigs(companyId = 0) {
  return readConfig(companyId);
}

export async function setConfig(name, config = {}, companyId = 0) {
  const cfg = await readConfig(companyId);
  cfg[name] = config;
  await writeConfig(cfg, companyId);
  return cfg[name];
}

export async function deleteConfig(name, companyId = 0) {
  const cfg = await readConfig(companyId);
  delete cfg[name];
  await writeConfig(cfg, companyId);
}

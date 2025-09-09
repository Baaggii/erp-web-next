import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

async function readLayout(companyId = 0) {
    try {
      const { path: filePath } = await getConfigPath(
        'posTransactionLayout.json',
        companyId,
      );
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
}

async function writeLayout(cfg, companyId = 0) {
  const filePath = tenantConfigPath('posTransactionLayout.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getLayout(name, companyId = 0) {
  const cfg = await readLayout(companyId);
  return cfg[name] || null;
}

export async function getAllLayouts(companyId = 0) {
  return readLayout(companyId);
}

export async function setLayout(name, layout = {}, companyId = 0) {
  const cfg = await readLayout(companyId);
  cfg[name] = layout;
  await writeLayout(cfg, companyId);
  return cfg[name];
}

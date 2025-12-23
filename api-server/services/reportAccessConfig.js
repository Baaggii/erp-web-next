import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(
    'report_management/allowedReports.json',
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
  const filePath = tenantConfigPath('report_management/allowedReports.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function parseEntry(raw = {}) {
  return {
    branches: Array.isArray(raw.branches)
      ? raw.branches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    departments: Array.isArray(raw.departments)
      ? raw.departments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    workplaces: Array.isArray(raw.workplaces)
      ? raw.workplaces.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    positions: Array.isArray(raw.positions)
      ? raw.positions.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
  };
}

export async function listAllowedReports(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const result = {};
  for (const [proc, info] of Object.entries(cfg)) {
    result[proc] = parseEntry(info);
  }
  return { config: result, isDefault };
}

export async function getAllowedReport(proc, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: parseEntry(cfg[proc]), isDefault };
}

export async function setAllowedReport(proc, info, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  cfg[proc] = parseEntry(info);
  await writeConfig(cfg, companyId);
  return cfg[proc];
}

export async function removeAllowedReport(proc, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (cfg[proc]) {
    delete cfg[proc];
    await writeConfig(cfg, companyId);
  }
}

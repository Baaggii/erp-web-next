import fs from 'fs/promises';
import path from 'path';
import { listTableColumnMeta } from '../../db/index.js';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

  async function readConfig(companyId = 0) {
    const { path: filePath, isDefault } = await getConfigPath(
      'tableDisplayFields.json',
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
  const filePath = tenantConfigPath('tableDisplayFields.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getDisplayFields(table, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  if (cfg[table]) return { config: cfg[table], isDefault };

  try {
    const meta = await listTableColumnMeta(table, companyId);
    if (!Array.isArray(meta) || meta.length === 0) {
      return { config: { idField: null, displayFields: [] }, isDefault };
    }
    const idField =
      meta.find((c) => String(c.key).toUpperCase() === 'PRI')?.name || meta[0].name;
    const displayFields = meta
      .map((c) => c.name)
      .filter((n) => n !== idField)
      .slice(0, 3);
    return { config: { idField, displayFields }, isDefault };
  } catch {
    return { config: { idField: null, displayFields: [] }, isDefault };
  }
}

export async function getAllDisplayFields(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg, isDefault };
}

export async function setDisplayFields(
  table,
  { idField, displayFields },
  companyId = 0,
) {
  if (!Array.isArray(displayFields)) displayFields = [];
  if (displayFields.length > 20) {
    throw new Error('Up to 20 display fields can be configured');
  }
  const { cfg } = await readConfig(companyId);
  cfg[table] = { idField, displayFields };
  await writeConfig(cfg, companyId);
  return cfg[table];
}

export async function removeDisplayFields(table, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (cfg[table]) {
    delete cfg[table];
    await writeConfig(cfg, companyId);
  }
}

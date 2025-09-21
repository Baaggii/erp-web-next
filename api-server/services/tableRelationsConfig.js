import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

const CONFIG_FILE = 'tableRelations.json';

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(CONFIG_FILE, companyId);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return { cfg: JSON.parse(data), isDefault };
  } catch {
    return { cfg: {}, isDefault: true };
  }
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath(CONFIG_FILE, companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getCustomRelations(table, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg[table] || {}, isDefault };
}

export async function getAllCustomRelations(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg, isDefault };
}

export async function setCustomRelation(table, column, relation, companyId = 0) {
  if (!table) throw new Error('table is required');
  if (!column) throw new Error('column is required');
  const targetTable = relation?.targetTable ? String(relation.targetTable).trim() : '';
  const targetColumn = relation?.targetColumn ? String(relation.targetColumn).trim() : '';
  if (!targetTable) throw new Error('targetTable is required');
  if (!targetColumn) throw new Error('targetColumn is required');
  const { cfg } = await readConfig(companyId);
  if (!cfg[table]) cfg[table] = {};
  cfg[table][column] = { targetTable, targetColumn };
  await writeConfig(cfg, companyId);
  return cfg[table][column];
}

export async function removeCustomRelation(table, column, companyId = 0) {
  if (!table) throw new Error('table is required');
  if (!column) throw new Error('column is required');
  const { cfg } = await readConfig(companyId);
  if (cfg[table]?.[column]) {
    delete cfg[table][column];
    if (Object.keys(cfg[table]).length === 0) delete cfg[table];
    await writeConfig(cfg, companyId);
  }
}

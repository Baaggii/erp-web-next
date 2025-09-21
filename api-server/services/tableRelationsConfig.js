import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

const CONFIG_FILE = 'tableRelations.json';

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(CONFIG_FILE, companyId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { cfg: parsed, isDefault };
    }
  } catch {}
  return { cfg: {}, isDefault: true };
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath(CONFIG_FILE, companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function formatRelation(column, relation) {
  if (!relation || typeof relation !== 'object') return null;
  const referencedTable = String(relation.referencedTable || relation.REFERENCED_TABLE_NAME || '').trim();
  const referencedColumn = String(
    relation.referencedColumn || relation.REFERENCED_COLUMN_NAME || '',
  ).trim();
  if (!referencedTable || !referencedColumn) return null;
  return {
    COLUMN_NAME: column,
    REFERENCED_TABLE_NAME: referencedTable,
    REFERENCED_COLUMN_NAME: referencedColumn,
    isCustom: true,
  };
}

export async function listCustomTableRelations(table, companyId = 0) {
  const tableName = String(table || '').trim();
  if (!tableName) return { relations: [], isDefault: true };
  const { cfg, isDefault } = await readConfig(companyId);
  const tableCfg = cfg[tableName] && typeof cfg[tableName] === 'object' ? cfg[tableName] : {};
  const relations = Object.entries(tableCfg)
    .map(([column, rel]) => formatRelation(column, rel))
    .filter(Boolean);
  return { relations, isDefault };
}

export async function setCustomTableRelation(
  table,
  column,
  { referencedTable, referencedColumn } = {},
  companyId = 0,
) {
  const tableName = String(table || '').trim();
  const columnName = String(column || '').trim();
  const refTable = String(referencedTable || '').trim();
  const refColumn = String(referencedColumn || '').trim();

  if (!tableName || !columnName || !refTable || !refColumn) {
    throw new Error('Table relation requires table, column, referencedTable, and referencedColumn');
  }

  const { cfg } = await readConfig(companyId);
  if (!cfg[tableName] || typeof cfg[tableName] !== 'object') cfg[tableName] = {};
  cfg[tableName][columnName] = { referencedTable: refTable, referencedColumn: refColumn };
  await writeConfig(cfg, companyId);

  return {
    COLUMN_NAME: columnName,
    REFERENCED_TABLE_NAME: refTable,
    REFERENCED_COLUMN_NAME: refColumn,
    isCustom: true,
  };
}

export async function removeCustomTableRelation(table, column, companyId = 0) {
  const tableName = String(table || '').trim();
  const columnName = String(column || '').trim();
  if (!tableName || !columnName) return;
  const { cfg } = await readConfig(companyId);
  if (!cfg[tableName] || typeof cfg[tableName] !== 'object') return;
  if (cfg[tableName][columnName]) {
    delete cfg[tableName][columnName];
    if (Object.keys(cfg[tableName]).length === 0) {
      delete cfg[tableName];
    }
    await writeConfig(cfg, companyId);
  }
}


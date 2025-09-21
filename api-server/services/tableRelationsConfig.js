import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

const FILE_NAME = 'tableRelations.json';

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(FILE_NAME, companyId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { cfg: data, isDefault };
    }
  } catch {}
  return { cfg: {}, isDefault };
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath(FILE_NAME, companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function normalizeRelation(relation = {}) {
  const targetTable = relation.table ?? relation.targetTable;
  const targetColumn = relation.column ?? relation.targetColumn;
  const idField = relation.idField ?? relation.id_field;
  const displayFields = relation.displayFields ?? relation.display_fields;

  const tableStr = typeof targetTable === 'string' ? targetTable.trim() : '';
  const columnStr = typeof targetColumn === 'string' ? targetColumn.trim() : '';
  if (!tableStr) {
    throw new Error('targetTable is required');
  }
  if (!columnStr) {
    throw new Error('targetColumn is required');
  }

  const normalized = { table: tableStr, column: columnStr };
  if (typeof idField === 'string' && idField.trim()) {
    normalized.idField = idField.trim();
  }
  if (Array.isArray(displayFields)) {
    normalized.displayFields = displayFields.map((f) => String(f));
  }
  return normalized;
}

export async function listAllCustomRelations(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg, isDefault };
}

export async function listCustomRelations(table, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg?.[table] ?? {}, isDefault };
}

export async function saveCustomRelation(table, column, relation, companyId = 0) {
  if (!table) throw new Error('table is required');
  if (!column) throw new Error('column is required');
  const normalized = normalizeRelation(relation);
  const { cfg } = await readConfig(companyId);
  if (!cfg[table]) cfg[table] = {};
  cfg[table][column] = normalized;
  await writeConfig(cfg, companyId);
  return normalized;
}

export async function removeCustomRelation(table, column, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (cfg?.[table]?.[column]) {
    delete cfg[table][column];
    if (Object.keys(cfg[table]).length === 0) {
      delete cfg[table];
    }
    await writeConfig(cfg, companyId);
  }
}

export async function removeTableCustomRelations(table, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (cfg?.[table]) {
    delete cfg[table];
    await writeConfig(cfg, companyId);
  }
}


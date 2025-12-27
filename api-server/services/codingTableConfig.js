import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';
import { assertAdminUser } from '../utils/admin.js';

async function ensureDir(companyId = 0) {
  const filePath = tenantConfigPath('codingTableConfigs.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function ensureAdmin(user, sessionPermissions) {
  // Admin-only: coding table configs influence schema/column mappings.
  assertAdminUser(user, sessionPermissions);
}

  async function readConfig(companyId = 0) {
    const { path: filePath, isDefault } = await getConfigPath(
      'codingTableConfigs.json',
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
  await ensureDir(companyId);
  const filePath = tenantConfigPath('codingTableConfigs.json', companyId);
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function parseConfig(raw = {}) {
  const renameMap =
    raw && typeof raw.renameMap === 'object' && raw.renameMap !== null
      ? raw.renameMap
      : {};
  const columnTypes =
    raw && typeof raw.columnTypes === 'object' && raw.columnTypes !== null
      ? raw.columnTypes
      : {};
  return {
    sheet: typeof raw.sheet === 'string' ? raw.sheet : '',
    headerRow: Number(raw.headerRow) || 1,
    mnHeaderRow: raw.mnHeaderRow ? String(raw.mnHeaderRow) : '',
    idFilterMode: typeof raw.idFilterMode === 'string' ? raw.idFilterMode : 'contains',
    idColumn: typeof raw.idColumn === 'string' ? raw.idColumn : '',
    nameColumn: typeof raw.nameColumn === 'string' ? raw.nameColumn : '',
    otherColumns: Array.isArray(raw.otherColumns)
      ? raw.otherColumns.map(String)
      : [],
    uniqueFields: Array.isArray(raw.uniqueFields)
      ? raw.uniqueFields.map(String)
      : [],
    calcText: typeof raw.calcText === 'string' ? raw.calcText : '',
    columnTypes,
    notNullMap:
      raw && typeof raw.notNullMap === 'object' && raw.notNullMap !== null
        ? raw.notNullMap
        : {},
    allowZeroMap:
      raw && typeof raw.allowZeroMap === 'object' && raw.allowZeroMap !== null
        ? raw.allowZeroMap
        : {},
    defaultValues:
      raw && typeof raw.defaultValues === 'object' && raw.defaultValues !== null
        ? raw.defaultValues
        : {},
    defaultFrom:
      raw && typeof raw.defaultFrom === 'object' && raw.defaultFrom !== null
        ? raw.defaultFrom
        : {},
    renameMap,
    extraFields: Array.isArray(raw.extraFields)
      ? raw.extraFields.map(String)
      : [],
    populateRange: !!raw.populateRange,
    startYear: raw.startYear ? String(raw.startYear) : '',
    endYear: raw.endYear ? String(raw.endYear) : '',
    autoIncStart: raw.autoIncStart ? String(raw.autoIncStart) : '1',
    triggers: typeof raw.triggers === 'string' ? raw.triggers : '',
    foreignKeys: typeof raw.foreignKeys === 'string' ? raw.foreignKeys : '',
  };
}

export async function getConfig(table, companyId = 0, options = {}) {
  ensureAdmin(options.user, options.sessionPermissions);
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: parseConfig(cfg[table]), isDefault };
}

export async function getAllConfigs(companyId = 0, options = {}) {
  ensureAdmin(options.user, options.sessionPermissions);
  const { cfg, isDefault } = await readConfig(companyId);
  const result = {};
  for (const [tbl, info] of Object.entries(cfg)) {
    result[tbl] = parseConfig(info);
  }
  return { config: result, isDefault };
}

export async function setConfig(table, config = {}, companyId = 0, options = {}) {
  ensureAdmin(options.user, options.sessionPermissions);
  const { cfg } = await readConfig(companyId);
  cfg[table] = config;
  await writeConfig(cfg, companyId);
  return cfg[table];
}

export async function deleteConfig(table, companyId = 0, options = {}) {
  ensureAdmin(options.user, options.sessionPermissions);
  const { cfg } = await readConfig(companyId);
  if (cfg[table]) {
    delete cfg[table];
    await writeConfig(cfg, companyId);
  }
}

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const filePath = path.join(rootDir, 'config', 'codingTableConfigs.json');

async function ensureDir() {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readConfig() {
  try {
    await ensureDir();
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeConfig(cfg) {
  await ensureDir();
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function parseViewSource(raw) {
  const result = {};
  if (raw && typeof raw === 'object') {
    for (const [field, info] of Object.entries(raw)) {
      if (info && typeof info.table === 'string' && typeof info.view === 'string') {
        result[field] = {
          table: info.table,
          view: info.view,
        };
      }
    }
  }
  return result;
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
    viewSource: parseViewSource(raw.viewSource),
    populateRange: !!raw.populateRange,
    startYear: raw.startYear ? String(raw.startYear) : '',
    endYear: raw.endYear ? String(raw.endYear) : '',
    autoIncStart: raw.autoIncStart ? String(raw.autoIncStart) : '1',
  };
}

export async function getConfig(table) {
  const cfg = await readConfig();
  return parseConfig(cfg[table]);
}

export async function getAllConfigs() {
  const cfg = await readConfig();
  const result = {};
  for (const [tbl, info] of Object.entries(cfg)) {
    result[tbl] = parseConfig(info);
  }
  return result;
}

export async function setConfig(table, config = {}) {
  const cfg = await readConfig();
  cfg[table] = {
    ...config,
    viewSource: parseViewSource(config.viewSource),
  };
  await writeConfig(cfg);
  return cfg[table];
}

export async function deleteConfig(table) {
  const cfg = await readConfig();
  if (cfg[table]) {
    delete cfg[table];
    await writeConfig(cfg);
  }
}

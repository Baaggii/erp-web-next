import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'posTransactionConfigs.json');

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeConfig(cfg) {
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function parseTable(raw = {}) {
  return {
    table: typeof raw.table === 'string' ? raw.table : '',
    transaction: typeof raw.transaction === 'string' ? raw.transaction : '',
    position: typeof raw.position === 'string' ? raw.position : 'hidden',
    multiRow: !!raw.multiRow,
  };
}

function parseEntry(raw = {}) {
  return {
    moduleKey: typeof raw.moduleKey === 'string' ? raw.moduleKey : '',
    masterTable: typeof raw.masterTable === 'string' ? raw.masterTable : '',
    tables: Array.isArray(raw.tables) ? raw.tables.map(parseTable) : [],
    calculatedFields: Array.isArray(raw.calculatedFields)
      ? raw.calculatedFields.map((c) => ({
          target: c.target || '',
          expression: c.expression || '',
        }))
      : [],
    status: raw.status && typeof raw.status === 'object'
      ? {
          beforePost: raw.status.beforePost ?? null,
          afterPost: raw.status.afterPost ?? null,
        }
      : { beforePost: null, afterPost: null },
  };
}

export async function getPosConfig(name) {
  const cfg = await readConfig();
  return parseEntry(cfg[name]);
}

export async function getAllPosConfigs() {
  const cfg = await readConfig();
  const result = {};
  for (const [name, info] of Object.entries(cfg)) {
    result[name] = parseEntry(info);
  }
  return result;
}

export async function setPosConfig(name, config = {}) {
  const cfg = await readConfig();
  cfg[name] = {
    moduleKey: config.moduleKey || '',
    masterTable: config.masterTable || '',
    tables: Array.isArray(config.tables) ? config.tables.map(parseTable) : [],
    calculatedFields: Array.isArray(config.calculatedFields)
      ? config.calculatedFields.map((c) => ({
          target: c.target || '',
          expression: c.expression || '',
        }))
      : [],
    status: config.status && typeof config.status === 'object'
      ? {
          beforePost: config.status.beforePost ?? null,
          afterPost: config.status.afterPost ?? null,
        }
      : { beforePost: null, afterPost: null },
  };
  await writeConfig(cfg);
  return cfg[name];
}

export async function deletePosConfig(name) {
  const cfg = await readConfig();
  if (!cfg[name]) return;
  delete cfg[name];
  await writeConfig(cfg);
}

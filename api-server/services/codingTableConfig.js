import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'codingTableConfigs.json');

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

export async function getConfig(table) {
  const cfg = await readConfig();
  return cfg[table] || {};
}

export async function getAllConfigs() {
  return readConfig();
}

export async function setConfig(table, config = {}) {
  const cfg = await readConfig();
  cfg[table] = config;
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

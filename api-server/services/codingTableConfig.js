import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'codingTableConfigs.json');

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

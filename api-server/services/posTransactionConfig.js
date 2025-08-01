import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'posTransactionConfig.json');

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeConfig(cfg) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getConfig(name) {
  const cfg = await readConfig();
  return cfg[name] || null;
}

export async function getAllConfigs() {
  return readConfig();
}

export async function setConfig(name, config = {}) {
  const cfg = await readConfig();
  cfg[name] = config;
  await writeConfig(cfg);
  return cfg[name];
}

export async function deleteConfig(name) {
  const cfg = await readConfig();
  delete cfg[name];
  await writeConfig(cfg);
}

import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'generalConfig.json');

const defaults = {
  labelFontSize: 14,
  boxWidth: 60,
  boxHeight: 30,
  boxMaxWidth: 150,
};

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return { ...defaults, ...JSON.parse(data) };
  } catch {
    return { ...defaults };
  }
}

async function writeConfig(cfg) {
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getGeneralConfig() {
  return readConfig();
}

export async function updateGeneralConfig(updates = {}) {
  const cfg = await readConfig();
  Object.assign(cfg, updates);
  await writeConfig(cfg);
  return cfg;
}

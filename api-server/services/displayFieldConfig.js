import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'tableDisplayFields.json');

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

export async function getDisplayFields(table) {
  const cfg = await readConfig();
  return cfg[table] || { idField: null, displayFields: [] };
}

export async function getAllDisplayFields() {
  return readConfig();
}

export async function setDisplayFields(table, { idField, displayFields }) {
  if (!Array.isArray(displayFields)) displayFields = [];
  if (displayFields.length > 20) {
    throw new Error('Up to 20 display fields can be configured');
  }
  const cfg = await readConfig();
  cfg[table] = { idField, displayFields };
  await writeConfig(cfg);
  return cfg[table];
}

export async function removeDisplayFields(table) {
  const cfg = await readConfig();
  if (cfg[table]) {
    delete cfg[table];
    await writeConfig(cfg);
  }
}

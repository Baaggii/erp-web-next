import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'relationDisplayFields.json');

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

export async function getRelatedDisplay(table, field) {
  const cfg = await readConfig();
  if (table && field) return cfg[table]?.[field] || null;
  if (table) return cfg[table] || {};
  return cfg;
}

export async function setRelatedDisplay(table, field, displayFields = []) {
  const cfg = await readConfig();
  if (!cfg[table]) cfg[table] = {};
  cfg[table][field] = Array.isArray(displayFields) ? displayFields : [];
  await writeConfig(cfg);
  return cfg[table][field];
}

export async function getAllRelatedDisplays() {
  return readConfig();
}

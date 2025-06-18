import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'fieldRelations.json');

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

export async function getRelations(table) {
  const cfg = await readConfig();
  return cfg[table] || {};
}

export async function getAllRelations() {
  return readConfig();
}

export async function setRelation(table, column, rel) {
  const cfg = await readConfig();
  if (!cfg[table]) cfg[table] = {};
  cfg[table][column] = rel;
  await writeConfig(cfg);
  return cfg[table][column];
}

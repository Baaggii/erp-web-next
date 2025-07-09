import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'posTransactionConfig.json');

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function writeConfig(cfg) {
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getPosConfig() {
  return (await readConfig()) || {
    linked_tables: {},
    layout_positions: {},
    calculated_fields: [],
    pos_calculated_fields: {},
    status_rules: { field: 'status', pending: 'pending', posted: 'posted' },
  };
}

export async function setPosConfig(cfg) {
  await writeConfig(cfg || {});
}

export async function deletePosConfig() {
  await fs.unlink(filePath).catch(() => {});
}

import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'posTransactionLayout.json');

async function readLayout() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeLayout(cfg) {
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getLayout(name) {
  const cfg = await readLayout();
  return cfg[name] || null;
}

export async function getAllLayouts() {
  return readLayout();
}

export async function setLayout(name, layout = {}) {
  const cfg = await readLayout();
  cfg[name] = layout;
  await writeLayout(cfg);
  return cfg[name];
}

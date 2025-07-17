import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'posPendingTransactions.json');

async function readData() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeData(data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function listPending(name, employeeId) {
  const all = await readData();
  const filtered = {};
  for (const [id, rec] of Object.entries(all)) {
    if (name && rec.name !== name) continue;
    if (employeeId && rec.session?.employeeId !== employeeId) continue;
    filtered[id] = rec;
  }
  return filtered;
}

export async function getPending(id) {
  const all = await readData();
  return all[id] || null;
}

export async function savePending(id, record, employeeId) {
  const all = await readData();
  if (!id) {
    id = 'txn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  const key = String(id);
  const session = { ...(record.session || {}), employeeId };
  all[key] = { ...record, session, savedAt: new Date().toISOString() };
  await writeData(all);
  return { id: key, record: all[key] };
}

export async function deletePending(id) {
  const all = await readData();
  delete all[id];
  await writeData(all);
}

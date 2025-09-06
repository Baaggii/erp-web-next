import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, resolveConfigPath } from '../utils/configPaths.js';

async function readData(companyId = 0) {
  try {
    const filePath = await resolveConfigPath('posPendingTransactions.json', companyId);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeData(data, companyId = 0) {
  const filePath = tenantConfigPath('posPendingTransactions.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function listPending(name, employeeId, companyId = 0) {
  const all = await readData(companyId);
  const filtered = {};
  for (const [id, rec] of Object.entries(all)) {
    if (name && rec.name !== name) continue;
    if (employeeId && rec.session?.employeeId !== employeeId) continue;
    filtered[id] = rec;
  }
  return filtered;
}

export async function getPending(id, companyId = 0) {
  const all = await readData(companyId);
  return all[id] || null;
}

export async function savePending(id, record, employeeId, companyId = 0) {
  const all = await readData(companyId);
  if (!id) {
    id = 'txn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  const key = String(id);
  const session = { ...(record.session || {}), employeeId };
  all[key] = { ...record, session, savedAt: new Date().toISOString() };
  await writeData(all, companyId);
  return { id: key, record: all[key] };
}

export async function deletePending(id, companyId = 0) {
  const all = await readData(companyId);
  delete all[id];
  await writeData(all, companyId);
}

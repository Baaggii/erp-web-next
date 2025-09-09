import fs from 'fs/promises';
import path from 'path';
import { getResponseWithFile } from '../utils/openaiClient.js';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

async function readData(companyId = 0) {
    try {
      const { path: filePath } = await getConfigPath(
        'aiInventoryResults.json',
        companyId,
      );
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
}

async function writeData(data, companyId = 0) {
  const filePath = tenantConfigPath('aiInventoryResults.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function identifyItems(buffer, mimeType) {
  const prompt =
    'Identify inventory items and quantities from this image. Respond with JSON like [{"code":"ITEM1","qty":1}].';
  try {
    const text = await getResponseWithFile(prompt, buffer, mimeType);
    const match = text.match(/\[[\s\S]*\]/);
    const json = match ? match[0] : text;
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export async function saveResult(empid, items, companyId = 0) {
  const all = await readData(companyId);
  const id = 'ai_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  all[id] = { empid, items, confirmed: false, created: new Date().toISOString() };
  await writeData(all, companyId);
  return { id, ...all[id] };
}

export async function listResults(companyId = 0) {
  return await readData(companyId);
}

export async function confirmResult(id, companyId = 0) {
  const all = await readData(companyId);
  if (all[id]) {
    all[id].confirmed = true;
    await writeData(all, companyId);
    return all[id];
  }
  return null;
}

export async function deleteResult(id, companyId = 0) {
  const all = await readData(companyId);
  delete all[id];
  await writeData(all, companyId);
}

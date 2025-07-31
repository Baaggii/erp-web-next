import fs from 'fs/promises';
import path from 'path';
import { getResponseWithFile } from '../utils/openaiClient.js';

const filePath = path.join(process.cwd(), 'config', 'aiInventoryResults.json');

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

export async function saveResult(empid, items) {
  const all = await readData();
  const id = 'ai_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  all[id] = { empid, items, confirmed: false, created: new Date().toISOString() };
  await writeData(all);
  return { id, ...all[id] };
}

export async function listResults() {
  return await readData();
}

export async function confirmResult(id) {
  const all = await readData();
  if (all[id]) {
    all[id].confirmed = true;
    await writeData(all);
    return all[id];
  }
  return null;
}

export async function deleteResult(id) {
  const all = await readData();
  delete all[id];
  await writeData(all);
}

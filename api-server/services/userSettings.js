import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'api-server', 'data', 'userSettings.json');

export async function getUserSettings(empid) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(data || '{}');
    return json[empid] || {};
  } catch {
    return {};
  }
}

export async function saveUserSettings(empid, settings) {
  let data = {};
  try {
    const text = await fs.readFile(filePath, 'utf8');
    data = JSON.parse(text || '{}');
  } catch {
    data = {};
  }
  data[empid] = { ...(data[empid] || {}), ...settings };
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return data[empid];
}

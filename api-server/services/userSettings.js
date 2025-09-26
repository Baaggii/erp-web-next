import fs from 'fs/promises';
import path from 'path';
import { resolveDataPath, tenantDataPath } from '../utils/dataPaths.js';

export async function getUserSettings(empid, companyId = 0) {
  try {
    const filePath = await resolveDataPath('userSettings.json', companyId);
    const data = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(data || '{}');
    return json[empid] || {};
  } catch {
    return {};
  }
}

export async function saveUserSettings(empid, settings, companyId = 0) {
  const filePath = tenantDataPath('userSettings.json', companyId);
  let data = {};
  try {
    const readPath = await resolveDataPath('userSettings.json', companyId);
    const text = await fs.readFile(readPath, 'utf8');
    data = JSON.parse(text || '{}');
  } catch {
    data = {};
  }
  const normalizedSettings = { ...(settings || {}) };
  if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'showTourButtons')) {
    normalizedSettings.showTourButtons = Boolean(normalizedSettings.showTourButtons);
  }

  data[empid] = { ...(data[empid] || {}), ...normalizedSettings };
  if (!Object.prototype.hasOwnProperty.call(data[empid], 'showTourButtons')) {
    data[empid].showTourButtons = true;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return data[empid];
}

import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, resolveConfigPath } from '../utils/configPaths.js';

async function readMappings(companyId = 0) {
  try {
    const filePath = await resolveConfigPath('headerMappings.json', companyId);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeMappings(map, companyId = 0) {
  const filePath = tenantConfigPath('headerMappings.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(map, null, 2) + '\n', 'utf8');
}

export async function getMappings(headers = [], lang, companyId = 0) {
  const map = await readMappings(companyId);
  const result = {};
  headers.forEach((h) => {
    const entry = map[h];
    if (entry == null) {
      // No mapping found; fall back to the original key
      result[h] = h;
      return;
    }
    if (typeof entry === 'object' && entry !== null) {
      // Prefer the requested language, then English, then the key itself
      if (lang && entry[lang]) {
        result[h] = entry[lang];
      } else if (entry.en) {
        result[h] = entry.en;
      } else {
        result[h] = h;
      }
    } else {
      // Primitive mapping string
      result[h] = entry;
    }
  });
  return result;
}

export async function addMappings(newMap, companyId = 0) {
  const map = await readMappings(companyId);
  for (const [k, v] of Object.entries(newMap)) {
    if (v == null) continue;
    if (
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof map[k] === 'object' &&
      map[k] !== null
    ) {
      map[k] = { ...map[k], ...v };
    } else {
      map[k] = v;
    }
  }
  await writeMappings(map, companyId);
  return map;
}

import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

function isLangObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const entries = Object.values(value);
  return entries.length > 0 && entries.every((item) => typeof item === 'string');
}

function normalizeMappingStore(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const normalized = {};
  const queue = [raw];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || typeof current !== 'object') continue;
    Object.entries(current).forEach(([key, value]) => {
      if (
        key === 'mappings' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !isLangObject(value)
      ) {
        queue.push(value);
        return;
      }
      if (typeof value === 'string' || isLangObject(value)) {
        normalized[key] = value;
      }
    });
  }
  return normalized;
}

async function readMappings(companyId = 0) {
  try {
    const { path: filePath } = await getConfigPath(
      'headerMappings.json',
      companyId,
    );
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return normalizeMappingStore(parsed);
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
  const normalizedUpdates = normalizeMappingStore(newMap);
  for (const [k, v] of Object.entries(normalizedUpdates)) {
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

import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'headerMappings.json');

async function readMappings() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeMappings(map) {
  await fs.writeFile(filePath, JSON.stringify(map, null, 2) + '\n', 'utf8');
}

export async function getMappings(headers = [], lang) {
  const map = await readMappings();
  const result = {};
  headers.forEach((h) => {
    const entry = map[h];
    if (entry == null) {
      // No mapping found; fall back to the original key
      result[h] = h;
      return;
    }
    if (typeof entry === 'object' && entry !== null) {
      // Prefer the requested language, then English, then first available value
      if (lang && entry[lang]) {
        result[h] = entry[lang];
      } else if (entry.en) {
        result[h] = entry.en;
      } else {
        const first = Object.values(entry)[0];
        result[h] = first != null ? first : h;
      }
    } else {
      // Primitive mapping string
      result[h] = entry;
    }
  });
  return result;
}

export async function addMappings(newMap) {
  const map = await readMappings();
  for (const [k, v] of Object.entries(newMap)) {
    if (v == null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      if (typeof map[k] === 'object' && map[k] !== null) {
        map[k] = { ...map[k], ...v };
      } else {
        map[k] = v;
      }
    } else if (typeof v === 'string') {
      // Treat plain strings as English mappings for backward compatibility
      if (typeof map[k] === 'object' && map[k] !== null) {
        map[k] = { ...map[k], en: v };
      } else {
        map[k] = { en: v };
      }
    } else {
      map[k] = v;
    }
  }
  await writeMappings(map);
  return map;
}

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
  await fs.writeFile(filePath, JSON.stringify(map, null, 2));
}

export async function getMappings(headers = []) {
  const map = await readMappings();
  const result = {};
  headers.forEach((h) => {
    if (map[h]) result[h] = map[h];
  });
  return result;
}

export async function addMappings(newMap) {
  const map = await readMappings();
  for (const [k, v] of Object.entries(newMap)) {
    if (v) map[k] = v;
  }
  await writeMappings(map);
  return map;
}

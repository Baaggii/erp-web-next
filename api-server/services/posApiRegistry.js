import fs from 'fs/promises';
import path from 'path';

const registryPath = path.join(process.cwd(), 'config', 'posApiEndpoints.json');

let cache = {
  endpoints: null,
  mtimeMs: 0,
};

function validateEndpoints(data) {
  if (!Array.isArray(data)) {
    const err = new Error('POSAPI endpoint registry must be an array');
    err.status = 400;
    throw err;
  }
  return data;
}

async function readRegistryFile() {
  try {
    const stats = await fs.stat(registryPath);
    if (!cache.endpoints || cache.mtimeMs !== stats.mtimeMs) {
      const raw = await fs.readFile(registryPath, 'utf8');
      const parsed = validateEndpoints(JSON.parse(raw));
      cache = {
        endpoints: parsed,
        mtimeMs: stats.mtimeMs,
      };
    }
    return cache.endpoints;
  } catch (err) {
    if (err.code === 'ENOENT') {
      cache = { endpoints: [], mtimeMs: 0 };
      return cache.endpoints;
    }
    throw err;
  }
}

export async function loadEndpoints() {
  return readRegistryFile();
}

export async function getEndpointById(id) {
  if (!id) {
    throw new Error('Endpoint id is required');
  }
  const endpoints = await readRegistryFile();
  return endpoints.find((endpoint) => endpoint.id === id);
}

export async function saveEndpoints(endpoints) {
  const validated = validateEndpoints(endpoints);
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, JSON.stringify(validated, null, 2));
  cache = {
    endpoints: validated,
    mtimeMs: Date.now(),
  };
  return cache.endpoints;
}

export function clearCache() {
  cache = { endpoints: null, mtimeMs: 0 };
}

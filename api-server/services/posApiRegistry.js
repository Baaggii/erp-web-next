import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const endpointsFilePath = path.resolve(__dirname, '../../config/posApiEndpoints.json');

let cachedEndpoints = null;
let cachedMtimeMs = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureArray(data) {
  if (!Array.isArray(data)) {
    throw new Error('POSAPI endpoint registry must be an array');
  }
  return data;
}

export async function loadEndpoints(options = {}) {
  const { forceReload = false } = options || {};
  try {
    const stat = await fs.stat(endpointsFilePath);
    if (!forceReload && cachedEndpoints && cachedMtimeMs === stat.mtimeMs) {
      return clone(cachedEndpoints);
    }
    const raw = await fs.readFile(endpointsFilePath, 'utf8');
    const parsed = ensureArray(raw.trim() ? JSON.parse(raw) : []);
    cachedEndpoints = parsed;
    cachedMtimeMs = stat.mtimeMs;
    return clone(parsed);
  } catch (err) {
    if (err.code === 'ENOENT') {
      cachedEndpoints = [];
      cachedMtimeMs = Date.now();
      return [];
    }
    throw err;
  }
}

export async function getEndpointById(id, options = {}) {
  if (!id) return null;
  const endpoints = await loadEndpoints(options);
  return endpoints.find((endpoint) => endpoint.id === id) || null;
}

export async function saveEndpoints(endpoints) {
  ensureArray(endpoints);
  const serialized = `${JSON.stringify(endpoints, null, 2)}\n`;
  await fs.mkdir(path.dirname(endpointsFilePath), { recursive: true });
  await fs.writeFile(endpointsFilePath, serialized, 'utf8');
  cachedEndpoints = clone(endpoints);
  const stat = await fs.stat(endpointsFilePath);
  cachedMtimeMs = stat.mtimeMs;
  return clone(cachedEndpoints);
}

export function getRegistryPath() {
  return endpointsFilePath;
}

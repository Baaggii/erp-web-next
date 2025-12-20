import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSettings } from './posApiSettings.js';

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

function mergeEndpointSettings(endpoint, settings) {
  if (!endpoint || typeof endpoint !== 'object') return endpoint;
  const settingsId = typeof endpoint.settingsId === 'string' ? endpoint.settingsId : null;
  if (!settingsId || !settings || typeof settings !== 'object') return endpoint;
  const matched = settings[settingsId];
  if (!matched || typeof matched !== 'object') return endpoint;
  const allowedKeys = [
    'supportsItems',
    'supportsMultipleReceipts',
    'supportsMultiplePayments',
    'receiptTypes',
    'taxTypes',
    'paymentMethods',
    'receiptTypeDescriptions',
    'paymentMethodDescriptions',
    'taxTypeDescriptions',
    'paymentMethodFields',
  ];
  const merged = { ...matched, ...endpoint };
  const filtered = { ...endpoint };
  allowedKeys.forEach((key) => {
    if (merged[key] !== undefined) {
      filtered[key] = merged[key];
    }
  });
  return filtered;
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
    const settings = await loadSettings({ forceReload });
    cachedEndpoints = parsed.map((endpoint) => mergeEndpointSettings(endpoint, settings));
    cachedMtimeMs = stat.mtimeMs;
    return clone(cachedEndpoints);
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

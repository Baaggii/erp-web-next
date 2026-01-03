import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const settingsFilePath = path.resolve(__dirname, '../../config/posApiSettings.json');

let cachedSettings = null;
let cachedMtimeMs = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function loadSettings(options = {}) {
  const { forceReload = false } = options || {};
  try {
    const stat = await fs.stat(settingsFilePath);
    if (!forceReload && cachedSettings && cachedMtimeMs === stat.mtimeMs) {
      return clone(cachedSettings);
    }
    const raw = await fs.readFile(settingsFilePath, 'utf8');
    let parsed;
    try {
      parsed = raw.trim() ? JSON.parse(raw) : {};
    } catch (err) {
      const parseError = new Error(
        `Failed to parse POSAPI settings at ${settingsFilePath}: ${err.message}`,
      );
      parseError.code = 'POSAPI_SETTINGS_PARSE';
      parseError.cause = err;
      parseError.path = settingsFilePath;
      throw parseError;
    }
    cachedSettings = parsed && typeof parsed === 'object' ? parsed : {};
    cachedMtimeMs = stat.mtimeMs;
    return clone(cachedSettings);
  } catch (err) {
    if (err.code === 'ENOENT') {
      cachedSettings = {};
      cachedMtimeMs = Date.now();
      return {};
    }
    throw err;
  }
}

export function getSettingsPath() {
  return settingsFilePath;
}

import { pool } from '../../db/index.js';
import { getGeneralConfig } from './generalConfig.js';

function parseBool(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return null;
}

export async function isEventEngineEnabled(conn = pool) {
  try {
    const { config } = await getGeneralConfig();
    if (parseBool(config?.eventsPolicy?.operationsEnabled) === true) {
      return true;
    }
  } catch {
    // ignore config read errors and keep evaluating other enablement sources
  }

  const envValue = parseBool(process.env.EVENT_ENGINE_ENABLED);
  if (envValue !== null) return envValue;

  try {
    const [rows] = await conn.query('SELECT event_engine_enabled FROM settings LIMIT 1');
    const dbValue = rows?.[0]?.event_engine_enabled;
    return Number(dbValue) === 1;
  } catch {
    return false;
  }
}


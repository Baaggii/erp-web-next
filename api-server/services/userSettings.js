import fs from 'fs/promises';
import path from 'path';
import { resolveDataPath, tenantDataPath } from '../utils/dataPaths.js';

function normalizeEmpid(empid) {
  return String(empid || '').trim().toUpperCase();
}

function resolveEmpidSettings(data, empid) {
  const normalized = normalizeEmpid(empid);
  if (!normalized || typeof data !== 'object' || !data) return {};

  if (Object.prototype.hasOwnProperty.call(data, normalized)) {
    return { ...(data[normalized] || {}) };
  }

  const legacyKey = Object.keys(data).find((key) => normalizeEmpid(key) === normalized);
  if (!legacyKey) return {};

  return { ...(data[legacyKey] || {}) };
}

export async function getUserSettings(empid, companyId = 0) {
  try {
    const filePath = await resolveDataPath('userSettings.json', companyId);
    const data = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(data || '{}');
    const settings = resolveEmpidSettings(json, empid);
    if (!Object.prototype.hasOwnProperty.call(settings, 'showTourButtons')) {
      settings.showTourButtons = true;
    }
    if (
      !Object.prototype.hasOwnProperty.call(settings, 'settings_enable_tour_builder')
    ) {
      settings.settings_enable_tour_builder = true;
    }
    if (!Object.prototype.hasOwnProperty.call(settings, 'webPushEnabled')) {
      settings.webPushEnabled = false;
    }
    return settings;
  } catch {
    return {
      showTourButtons: true,
      settings_enable_tour_builder: true,
      webPushEnabled: false,
    };
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
  const normalizedEmpid = normalizeEmpid(empid);
  if (!normalizedEmpid) {
    throw new Error('empid is required');
  }

  const normalizedSettings = { ...(settings || {}) };
  if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'showTourButtons')) {
    normalizedSettings.showTourButtons = Boolean(normalizedSettings.showTourButtons);
  }
  if (
    Object.prototype.hasOwnProperty.call(
      normalizedSettings,
      'settings_enable_tour_builder',
    )
  ) {
    normalizedSettings.settings_enable_tour_builder = Boolean(
      normalizedSettings.settings_enable_tour_builder,
    );
  }
  if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'webPushEnabled')) {
    normalizedSettings.webPushEnabled = Boolean(normalizedSettings.webPushEnabled);
  }

  const legacyKeys = Object.keys(data).filter(
    (key) => key !== normalizedEmpid && normalizeEmpid(key) === normalizedEmpid,
  );
  const mergedExisting = legacyKeys.reduce(
    (acc, key) => ({ ...acc, ...(data[key] || {}) }),
    data[normalizedEmpid] || {},
  );
  for (const key of legacyKeys) {
    delete data[key];
  }

  data[normalizedEmpid] = { ...mergedExisting, ...normalizedSettings };
  if (!Object.prototype.hasOwnProperty.call(data[normalizedEmpid], 'showTourButtons')) {
    data[normalizedEmpid].showTourButtons = true;
  }
  if (
    !Object.prototype.hasOwnProperty.call(data[normalizedEmpid], 'settings_enable_tour_builder')
  ) {
    data[normalizedEmpid].settings_enable_tour_builder = true;
  }
  if (!Object.prototype.hasOwnProperty.call(data[normalizedEmpid], 'webPushEnabled')) {
    data[normalizedEmpid].webPushEnabled = false;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return data[normalizedEmpid];
}

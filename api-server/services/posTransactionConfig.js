import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(
    'posTransactionConfig.json',
    companyId,
  );
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return { cfg: JSON.parse(data), isDefault };
  } catch {
    return { cfg: {}, isDefault: true };
  }
}

function normalizeAccessValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function normalizeAccessList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const normalized = [];
  list.forEach((item) => {
    const val = normalizeAccessValue(item);
    if (val !== null) normalized.push(val);
  });
  return normalized;
}

function matchesScope(list, value) {
  if (!Array.isArray(list) || list.length === 0) return true;
  const normalizedValue = normalizeAccessValue(value);
  if (normalizedValue === null) return true;
  return list.includes(normalizedValue);
}

function normalizeStoredAccessList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const normalized = [];
  list.forEach((item) => {
    if (item === undefined || item === null) return;
    const num = Number(item);
    if (Number.isFinite(num)) {
      normalized.push(num);
      return;
    }
    const str = String(item).trim();
    if (str) normalized.push(str);
  });
  return normalized;
}

export function hasPosTransactionAccess(config, branchId, departmentId) {
  if (!config || typeof config !== 'object') return true;

  const branchValue = normalizeAccessValue(branchId);
  const departmentValue = normalizeAccessValue(departmentId);

  const allowedBranches = normalizeAccessList(config.allowedBranches);
  const allowedDepartments = normalizeAccessList(config.allowedDepartments);

  const generalAllowed =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue);

  if (generalAllowed) return true;

  const temporaryEnabled = Boolean(
    config.supportsTemporarySubmission ??
      config.allowTemporarySubmission ??
      config.supportsTemporary ??
      false,
  );

  if (!temporaryEnabled) return false;

  const temporaryBranches = normalizeAccessList(
    config.temporaryAllowedBranches,
  );
  const temporaryDepartments = normalizeAccessList(
    config.temporaryAllowedDepartments,
  );

  return (
    matchesScope(temporaryBranches, branchValue) &&
    matchesScope(temporaryDepartments, departmentValue)
  );
}

export function filterPosConfigsByAccess(configMap = {}, branchId, departmentId) {
  const filtered = {};
  Object.entries(configMap || {}).forEach(([name, info]) => {
    if (!info || typeof info !== 'object') return;
    if (hasPosTransactionAccess(info, branchId, departmentId)) {
      filtered[name] = info;
    }
  });
  return filtered;
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath('posTransactionConfig.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getConfig(name, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg[name] || null, isDefault };
}

export async function getAllConfigs(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  return { config: cfg, isDefault };
}

export async function setConfig(name, config = {}, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  const normalizedConfig = {
    ...config,
    allowedBranches: normalizeStoredAccessList(config.allowedBranches),
    allowedDepartments: normalizeStoredAccessList(config.allowedDepartments),
    temporaryAllowedBranches: normalizeStoredAccessList(
      config.temporaryAllowedBranches,
    ),
    temporaryAllowedDepartments: normalizeStoredAccessList(
      config.temporaryAllowedDepartments,
    ),
    supportsTemporarySubmission: Boolean(
      config.supportsTemporarySubmission ??
        config.allowTemporarySubmission ??
        config.supportsTemporary ??
        false,
    ),
    allowTemporarySubmission: Boolean(
      config.supportsTemporarySubmission ??
        config.allowTemporarySubmission ??
        config.supportsTemporary ??
        false,
    ),
    procedures: Array.isArray(config.procedures)
      ? config.procedures
          .map((proc) => (typeof proc === 'string' ? proc.trim() : ''))
          .filter((proc) => proc)
      : [],
  };
  cfg[name] = normalizedConfig;
  await writeConfig(cfg, companyId);
  return cfg[name];
}

export async function deleteConfig(name, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  delete cfg[name];
  await writeConfig(cfg, companyId);
}

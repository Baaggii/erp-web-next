import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

const POSAPI_RECEIPT_TYPES = new Set([
  'B2C_RECEIPT',
  'B2C_INVOICE',
  'B2B_INVOICE',
]);

const ENV_POSAPI_RECEIPT_TYPE =
  process.env.POSAPI_RECEIPT_TYPE?.trim().toUpperCase() || '';

const DEFAULT_POSAPI_RECEIPT_TYPE = POSAPI_RECEIPT_TYPES.has(
  ENV_POSAPI_RECEIPT_TYPE,
)
  ? ENV_POSAPI_RECEIPT_TYPE
  : 'B2C_RECEIPT';

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return defaultValue;
    if (['true', '1', 'yes', 'y'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n'].includes(trimmed)) return false;
  }
  return Boolean(value);
}

function sanitizeReceiptType(value) {
  if (typeof value !== 'string') return '';
  const upper = value.trim().toUpperCase();
  if (!upper) return '';
  return POSAPI_RECEIPT_TYPES.has(upper) ? upper : '';
}

function applyPosApiDefaults(config) {
  if (!config || typeof config !== 'object') return config;
  const result = { ...config };
  result.posApiEnabled = normalizeBoolean(result.posApiEnabled, false);
  const sanitized = sanitizeReceiptType(result.posApiType);
  if (sanitized) {
    result.posApiType = sanitized;
  } else {
    delete result.posApiType;
    result.posApiType = DEFAULT_POSAPI_RECEIPT_TYPE;
  }
  return result;
}

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

export function pickScopeValue(requestValue, sessionValue) {
  if (requestValue !== undefined && requestValue !== null) {
    if (typeof requestValue === 'string') {
      if (requestValue.trim() !== '') return requestValue;
    } else {
      return requestValue;
    }
  }
  if (sessionValue !== undefined && sessionValue !== null) {
    return sessionValue;
  }
  return undefined;
}

export function hasPosConfigReadAccess(session = {}, actions = {}) {
  const sessionPerms = session?.permissions || {};
  if (sessionPerms.system_settings) return true;

  const actionPermissions = actions?.permissions || {};
  if (actionPermissions.system_settings) return true;

  const apiPermissions = actions?.api || {};
  if (apiPermissions['/api/pos_txn_config']) return true;

  if (actions.pos_transaction_management) return true;
  if (actions.pos_transactions) return true;

  return false;
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
  const raw = cfg[name];
  if (!raw || typeof raw !== 'object') {
    return { config: null, isDefault };
  }
  return { config: applyPosApiDefaults(raw), isDefault };
}

export async function getAllConfigs(companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const normalized = {};
  Object.entries(cfg || {}).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    normalized[key] = applyPosApiDefaults(value);
  });
  return { config: normalized, isDefault };
}

export async function setConfig(name, config = {}, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  const normalizedConfig = {
    ...config,
    posApiEnabled: normalizeBoolean(config.posApiEnabled, false),
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
  const sanitizedType = sanitizeReceiptType(config.posApiType);
  if (sanitizedType) {
    normalizedConfig.posApiType = sanitizedType;
  } else {
    delete normalizedConfig.posApiType;
  }
  cfg[name] = normalizedConfig;
  await writeConfig(cfg, companyId);
  return cfg[name];
}

export async function deleteConfig(name, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  delete cfg[name];
  await writeConfig(cfg, companyId);
}

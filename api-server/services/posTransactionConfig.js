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
  if (Array.isArray(value)) {
    const normalizedValues = value
      .map((item) => normalizeAccessValue(item))
      .filter((val) => val !== null);
    if (normalizedValues.length === 0) return false;
    return normalizedValues.some((val) => list.includes(val));
  }
  const normalizedValue = normalizeAccessValue(value);
  if (normalizedValue === null) return true;
  return list.includes(normalizedValue);
}

function resolveWorkplacePosition(options, workplaceValue) {
  if (!options || typeof options !== 'object') return null;
  const workplaces = Array.isArray(workplaceValue) ? workplaceValue : [workplaceValue];
  for (const wp of workplaces) {
    const normalizedWorkplace = normalizeAccessValue(wp);
    if (normalizedWorkplace === null) continue;

    const mapCandidates = [
      options.workplacePositionMap,
      options.workplacePositionById,
      options.workplacePositionsMap,
    ];
    for (const map of mapCandidates) {
      if (map && typeof map === 'object' && !Array.isArray(map)) {
        const mappedPosition = normalizeAccessValue(map[normalizedWorkplace]);
        if (mappedPosition !== null) return mappedPosition;
      }
    }

    const listCandidates = [
      options.workplacePositions,
      options.workplacesWithPositions,
    ];
    for (const list of listCandidates) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const entryWorkplace = normalizeAccessValue(
          entry?.workplaceId ?? entry?.workplace_id ?? entry?.workplace ?? entry?.id,
        );
        if (entryWorkplace !== normalizedWorkplace) continue;
        const positionId = normalizeAccessValue(
          entry?.positionId ??
            entry?.position_id ??
            entry?.position ??
            entry?.workplacePositionId ??
            entry?.workplace_position_id,
        );
        if (positionId !== null) return positionId;
      }
    }

    const directPosition = normalizeAccessValue(
      options.workplacePositionId ??
        options.workplacePosition ??
        options.workplace_position_id ??
        options.workplace_position,
    );
    if (directPosition !== null) return directPosition;
  }
  return null;
}

function isPositionAllowed(allowedPositions, positionValue, workplaceValue, options) {
  const matchesDirect = matchesScope(allowedPositions, positionValue);
  if (matchesDirect) return true;
  if (!Array.isArray(allowedPositions) || allowedPositions.length === 0) return true;
  const workplacePosition = resolveWorkplacePosition(options, workplaceValue);
  if (workplacePosition === null) return false;
  return matchesScope(allowedPositions, workplacePosition);
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

export function hasPosTransactionAccess(
  config,
  branchId,
  departmentId,
  options = {},
) {
  if (!config || typeof config !== 'object') return true;

  const branchValue = normalizeAccessValue(branchId);
  const departmentValue = normalizeAccessValue(departmentId);
  const userRightValue = normalizeAccessValue(
    options?.userRightId ?? options?.userLevel ?? options?.userRight,
  );
  const workplaceValue = normalizeAccessValue(options?.workplaceId ?? options?.workplace);
  const positionValue = normalizeAccessValue(
    options?.positionId ?? options?.position ?? options?.employmentPositionId,
  );
  const userRightValues = Array.isArray(options?.userRights) ? options.userRights : null;
  const workplaceValues = Array.isArray(options?.workplaces) ? options.workplaces : null;
  const positionValues = Array.isArray(options?.positions) ? options.positions : null;

  const allowedBranches = normalizeAccessList(config.allowedBranches);
  const allowedDepartments = normalizeAccessList(config.allowedDepartments);
  const allowedUserRights = normalizeAccessList(config.allowedUserRights);
  const allowedWorkplaces = normalizeAccessList(config.allowedWorkplaces);
  const allowedPositions = normalizeAccessList(config.allowedPositions);
  const allowedProcedures = normalizeAccessList(config.procedures);
  const requestedProcedure = normalizeAccessValue(options?.procedure);

  const generalAllowed =
    matchesScope(allowedBranches, branchValue) &&
    matchesScope(allowedDepartments, departmentValue) &&
    matchesScope(allowedUserRights, userRightValues ?? userRightValue) &&
    matchesScope(allowedWorkplaces, workplaceValues ?? workplaceValue) &&
    isPositionAllowed(
      allowedPositions,
      positionValues ?? positionValue,
      workplaceValues ?? workplaceValue,
      options,
    ) &&
    matchesScope(allowedProcedures, requestedProcedure);

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
  const temporaryUserRights = normalizeAccessList(config.temporaryAllowedUserRights);
  const temporaryWorkplaces = normalizeAccessList(config.temporaryAllowedWorkplaces);
  const temporaryPositions = normalizeAccessList(config.temporaryAllowedPositions);
  const temporaryProcedures = normalizeAccessList(config.temporaryProcedures);

  return (
    matchesScope(temporaryBranches, branchValue) &&
    matchesScope(temporaryDepartments, departmentValue) &&
    matchesScope(temporaryUserRights, userRightValues ?? userRightValue) &&
    matchesScope(temporaryWorkplaces, workplaceValues ?? workplaceValue) &&
    isPositionAllowed(
      temporaryPositions,
      positionValues ?? positionValue,
      workplaceValues ?? workplaceValue,
      options,
    ) &&
    matchesScope(temporaryProcedures, requestedProcedure)
  );
}

export function filterPosConfigsByAccess(
  configMap = {},
  branchId,
  departmentId,
  options = {},
) {
  const filtered = {};
  Object.entries(configMap || {}).forEach(([name, info]) => {
    if (!info || typeof info !== 'object') return;
    if (hasPosTransactionAccess(info, branchId, departmentId, options)) {
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
    posApiMapping:
      config.posApiMapping && typeof config.posApiMapping === 'object' && !Array.isArray(config.posApiMapping)
        ? { ...config.posApiMapping }
        : {},
    posApiResponseMapping:
      config.posApiResponseMapping &&
      typeof config.posApiResponseMapping === 'object' &&
      !Array.isArray(config.posApiResponseMapping)
        ? { ...config.posApiResponseMapping }
        : {},
    allowedBranches: normalizeStoredAccessList(config.allowedBranches),
    allowedDepartments: normalizeStoredAccessList(config.allowedDepartments),
    allowedUserRights: normalizeStoredAccessList(config.allowedUserRights),
    allowedWorkplaces: normalizeStoredAccessList(config.allowedWorkplaces),
    allowedPositions: normalizeStoredAccessList(config.allowedPositions),
    temporaryAllowedBranches: normalizeStoredAccessList(
      config.temporaryAllowedBranches,
    ),
    temporaryAllowedDepartments: normalizeStoredAccessList(
      config.temporaryAllowedDepartments,
    ),
    temporaryAllowedUserRights: normalizeStoredAccessList(
      config.temporaryAllowedUserRights,
    ),
    temporaryAllowedWorkplaces: normalizeStoredAccessList(
      config.temporaryAllowedWorkplaces,
    ),
    temporaryAllowedPositions: normalizeStoredAccessList(
      config.temporaryAllowedPositions,
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
    temporaryProcedures: Array.isArray(config.temporaryProcedures)
      ? config.temporaryProcedures
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

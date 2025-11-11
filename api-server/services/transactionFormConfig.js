import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

  async function readConfig(companyId = 0) {
    const { path: filePath, isDefault } = await getConfigPath(
      'transactionForms.json',
      companyId,
    );
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return { cfg: JSON.parse(data), isDefault };
    } catch {
      return { cfg: {}, isDefault: true };
    }
  }

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath('transactionForms.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function arrify(val) {
  if (Array.isArray(val)) return val.map((v) => String(v));
  if (val === undefined || val === null) return [];
  return [String(val)];
}

function normalizeMixedAccessList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const normalized = [];
  list.forEach((value) => {
    if (value === undefined || value === null) return;
    const num = Number(value);
    if (Number.isFinite(num)) {
      normalized.push(num);
      return;
    }
    const str = String(value).trim();
    if (str) normalized.push(str);
  });
  return normalized;
}

function normalizePosApiMappingValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    const normalizedArray = value
      .map((entry) => normalizePosApiMappingValue(entry))
      .filter((entry) => {
        if (entry === '' || entry === undefined || entry === null) return false;
        if (typeof entry === 'object' && Object.keys(entry).length === 0) return false;
        if (Array.isArray(entry) && entry.length === 0) return false;
        return true;
      });
    return normalizedArray.length ? normalizedArray : '';
  }
  if (typeof value === 'object') {
    const normalizedObject = {};
    Object.entries(value).forEach(([key, val]) => {
      if (typeof key !== 'string') return;
      const normalized = normalizePosApiMappingValue(val);
      if (
        normalized === '' ||
        normalized === undefined ||
        normalized === null ||
        (typeof normalized === 'object' && !Array.isArray(normalized) && Object.keys(normalized).length === 0) ||
        (Array.isArray(normalized) && normalized.length === 0)
      ) {
        return;
      }
      normalizedObject[key] = normalized;
    });
    return Object.keys(normalizedObject).length ? normalizedObject : '';
  }
  return String(value);
}

function sanitizePosApiMapping(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const normalized = {};
  Object.entries(source).forEach(([key, value]) => {
    if (typeof key !== 'string') return;
    const normalizedValue = normalizePosApiMappingValue(value);
    if (
      normalizedValue === '' ||
      normalizedValue === undefined ||
      normalizedValue === null ||
      (typeof normalizedValue === 'object' && !Array.isArray(normalizedValue) && Object.keys(normalizedValue).length === 0) ||
      (Array.isArray(normalizedValue) && normalizedValue.length === 0)
    ) {
      return;
    }
    normalized[key] = normalizedValue;
  });
  return normalized;
}

function sanitizeInfoEndpointMappings(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const normalized = {};
  Object.entries(source).forEach(([endpointId, mapping]) => {
    if (typeof endpointId !== 'string') return;
    const trimmedId = endpointId.trim();
    if (!trimmedId) return;
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return;
    const normalizedMapping = {};
    Object.entries(mapping).forEach(([field, path]) => {
      if (typeof field !== 'string' || typeof path !== 'string') return;
      const trimmedField = field.trim();
      const trimmedPath = path.trim();
      if (!trimmedField || !trimmedPath) return;
      normalizedMapping[trimmedField] = trimmedPath;
    });
    if (Object.keys(normalizedMapping).length > 0) {
      normalized[trimmedId] = normalizedMapping;
    }
  });
  return normalized;
}

function parseEntry(raw = {}) {
  const temporaryFlag = Boolean(
    raw.supportsTemporarySubmission ??
      raw.allowTemporarySubmission ??
      raw.supportsTemporary ??
      false,
  );
  const mapping = sanitizePosApiMapping(raw.posApiMapping);
  const infoEndpointMappings = sanitizeInfoEndpointMappings(
    raw.infoEndpointMappings || raw.posApiInfoMappings,
  );
  const infoEndpointsSource = Array.isArray(raw.infoEndpoints)
    ? raw.infoEndpoints
    : Array.isArray(raw.posApiInfoEndpointIds)
      ? raw.posApiInfoEndpointIds
      : [];
  const infoEndpoints = infoEndpointsSource
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value);
  return {
    visibleFields: Array.isArray(raw.visibleFields)
      ? raw.visibleFields.map(String)
      : [],
    requiredFields: Array.isArray(raw.requiredFields)
      ? raw.requiredFields.map(String)
      : [],
    defaultValues: raw.defaultValues || {},
    editableDefaultFields: Array.isArray(raw.editableDefaultFields)
      ? raw.editableDefaultFields.map(String)
      : [],
    editableFields:
      raw.editableFields === undefined
        ? undefined
        : Array.isArray(raw.editableFields)
          ? raw.editableFields.map(String)
          : [],
    userIdFields: arrify(
      raw.userIdFields || (raw.userIdField ? [raw.userIdField] : []),
    ),
    branchIdFields: arrify(
      raw.branchIdFields || (raw.branchIdField ? [raw.branchIdField] : []),
    ),
    companyIdFields: arrify(
      raw.companyIdFields || (raw.companyIdField ? [raw.companyIdField] : []),
    ),
    dateField: arrify(raw.dateField),
    emailField: arrify(raw.emailField),
    imagenameField: arrify(raw.imagenameField),
    imageIdField: typeof raw.imageIdField === 'string' ? raw.imageIdField : '',
    imageFolder: typeof raw.imageFolder === 'string' ? raw.imageFolder : '',
    printEmpField: arrify(raw.printEmpField),
    printCustField: arrify(raw.printCustField),
    totalCurrencyFields: arrify(raw.totalCurrencyFields),
    totalAmountFields: arrify(raw.totalAmountFields),
    signatureFields: arrify(raw.signatureFields),
    headerFields: arrify(raw.headerFields),
    mainFields: arrify(raw.mainFields),
    footerFields: arrify(raw.footerFields),
    viewSource:
      raw && typeof raw.viewSource === 'object' && raw.viewSource !== null
        ? raw.viewSource
        : {},
    transactionTypeField:
      typeof raw.transactionTypeField === 'string'
        ? raw.transactionTypeField
        : '',
    transactionTypeValue:
      typeof raw.transactionTypeValue === 'string'
        ? raw.transactionTypeValue
        : '',
    detectFields: arrify(raw.detectFields || raw.detectField),
    moduleKey: typeof raw.moduleKey === 'string' ? raw.moduleKey : '',
    allowedBranches: Array.isArray(raw.allowedBranches)
      ? raw.allowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    allowedDepartments: Array.isArray(raw.allowedDepartments)
      ? raw.allowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    allowedUserRights: normalizeMixedAccessList(raw.allowedUserRights),
    allowedWorkplaces: normalizeMixedAccessList(raw.allowedWorkplaces),
    temporaryAllowedBranches: Array.isArray(raw.temporaryAllowedBranches)
      ? raw.temporaryAllowedBranches
          .map((v) => Number(v))
          .filter((v) => !Number.isNaN(v))
      : [],
    temporaryAllowedDepartments: Array.isArray(raw.temporaryAllowedDepartments)
      ? raw.temporaryAllowedDepartments
          .map((v) => Number(v))
          .filter((v) => !Number.isNaN(v))
      : [],
    temporaryAllowedUserRights: normalizeMixedAccessList(
      raw.temporaryAllowedUserRights,
    ),
    temporaryAllowedWorkplaces: normalizeMixedAccessList(
      raw.temporaryAllowedWorkplaces,
    ),
    moduleLabel: typeof raw.moduleLabel === 'string' ? raw.moduleLabel : '',
    procedures: arrify(raw.procedures || raw.procedure),
    temporaryProcedures: arrify(raw.temporaryProcedures),
    supportsTemporarySubmission: temporaryFlag,
    allowTemporarySubmission: temporaryFlag,
    posApiEnabled: Boolean(raw.posApiEnabled),
    posApiType:
      typeof raw.posApiType === 'string' && raw.posApiType.trim()
        ? raw.posApiType.trim()
        : '',
    posApiTypeField:
      typeof raw.posApiTypeField === 'string' ? raw.posApiTypeField : '',
    posApiEndpointId:
      typeof raw.posApiEndpointId === 'string' && raw.posApiEndpointId.trim()
        ? raw.posApiEndpointId.trim()
        : '',
    posApiInfoEndpointIds: infoEndpoints,
    fieldsFromPosApi: Array.isArray(raw.fieldsFromPosApi)
      ? raw.fieldsFromPosApi
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value)
      : [],
    posApiMapping: mapping,
    infoEndpointMappings,
    infoEndpoints,
  };
}

export async function getFormConfig(table, name, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const byTable = cfg[table] || {};
  const raw = byTable[name];
  return { config: parseEntry(raw), isDefault };
}

export async function getConfigsByTable(table, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const byTable = cfg[table] || {};
  const result = {};
  for (const [name, info] of Object.entries(byTable)) {
    result[name] = parseEntry(info);
  }
  return { config: result, isDefault };
}

export async function getConfigsByTransTypeValue(val, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const result = [];
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const [name, info] of Object.entries(names)) {
      const parsed = parseEntry(info);
      if (
        parsed.transactionTypeValue &&
        String(parsed.transactionTypeValue) === String(val)
      ) {
        result.push({ table: tbl, name, config: parsed });
      }
    }
  }
  return { configs: result, isDefault };
}

export async function findTableByProcedure(proc, companyId = 0) {
  if (!proc) return { table: null, isDefault: false };
  const { cfg, isDefault } = await readConfig(companyId);
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const info of Object.values(names)) {
      const parsed = parseEntry(info);
      if (parsed.procedures.includes(proc)) return { table: tbl, isDefault };
    }
  }
  return { table: null, isDefault };
}

export async function listTransactionNames(
  { moduleKey, branchId, departmentId, userRightId, workplaceId } = {},
  companyId = 0,
) {
  const { cfg, isDefault } = await readConfig(companyId);
  const result = {};
  const bId = branchId ? Number(branchId) : null;
  const dId = departmentId ? Number(departmentId) : null;
  const userRightValue =
    userRightId === undefined || userRightId === null
      ? null
      : Number.isFinite(Number(userRightId))
        ? Number(userRightId)
        : String(userRightId).trim() || null;
  const workplaceValue =
    workplaceId === undefined || workplaceId === null
      ? null
      : Number.isFinite(Number(workplaceId))
        ? Number(workplaceId)
        : String(workplaceId).trim() || null;
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const [name, info] of Object.entries(names)) {
      const parsed = parseEntry(info);
      const modKey = parsed.moduleKey;
      if (moduleKey && moduleKey !== modKey) continue;

      const allowedBranches = Array.isArray(parsed.allowedBranches)
        ? parsed.allowedBranches
        : [];
      const allowedDepartments = Array.isArray(parsed.allowedDepartments)
        ? parsed.allowedDepartments
        : [];
      const allowedUserRights = Array.isArray(parsed.allowedUserRights)
        ? parsed.allowedUserRights
        : [];
      const allowedWorkplaces = Array.isArray(parsed.allowedWorkplaces)
        ? parsed.allowedWorkplaces
        : [];
      const tempBranches = Array.isArray(parsed.temporaryAllowedBranches)
        ? parsed.temporaryAllowedBranches
        : [];
      const tempDepartments = Array.isArray(parsed.temporaryAllowedDepartments)
        ? parsed.temporaryAllowedDepartments
        : [];
      const tempUserRights = Array.isArray(parsed.temporaryAllowedUserRights)
        ? parsed.temporaryAllowedUserRights
        : [];
      const tempWorkplaces = Array.isArray(parsed.temporaryAllowedWorkplaces)
        ? parsed.temporaryAllowedWorkplaces
        : [];

      const branchAllowed =
        allowedBranches.length === 0 ||
        bId == null ||
        allowedBranches.includes(bId);
      const departmentAllowed =
        allowedDepartments.length === 0 ||
        dId == null ||
        allowedDepartments.includes(dId);
      const userRightAllowed =
        allowedUserRights.length === 0 ||
        userRightValue === null ||
        allowedUserRights.includes(userRightValue);
      const workplaceAllowed =
        allowedWorkplaces.length === 0 ||
        workplaceValue === null ||
        allowedWorkplaces.includes(workplaceValue);

      let permitted = branchAllowed && departmentAllowed && userRightAllowed && workplaceAllowed;

      if (!permitted) {
        const tempEnabled = Boolean(
          parsed.supportsTemporarySubmission ||
            parsed.allowTemporarySubmission ||
            parsed.supportsTemporary,
        );
        if (tempEnabled) {
          const tempBranchAllowed =
            tempBranches.length === 0 ||
            bId == null ||
            tempBranches.includes(bId);
          const tempDepartmentAllowed =
            tempDepartments.length === 0 ||
            dId == null ||
            tempDepartments.includes(dId);
          const tempUserRightAllowed =
            tempUserRights.length === 0 ||
            userRightValue === null ||
            tempUserRights.includes(userRightValue);
          const tempWorkplaceAllowed =
            tempWorkplaces.length === 0 ||
            workplaceValue === null ||
            tempWorkplaces.includes(workplaceValue);
          permitted =
            tempBranchAllowed && tempDepartmentAllowed && tempUserRightAllowed && tempWorkplaceAllowed;
        }
      }

      if (!permitted) continue;

      result[name] = { table: tbl, ...parsed };
    }
  }
  return { names: result, isDefault };
}

export async function setFormConfig(
  table,
  name,
  config,
  options = {},
  companyId = 0,
) {
  const {
    visibleFields = [],
    requiredFields = [],
    defaultValues = {},
    editableDefaultFields = [],
    editableFields,
    userIdFields = [],
    branchIdFields = [],
    companyIdFields = [],
    allowedBranches = [],
    allowedDepartments = [],
    allowedUserRights = [],
    allowedWorkplaces = [],
    temporaryAllowedBranches = [],
    temporaryAllowedDepartments = [],
    temporaryAllowedUserRights = [],
    temporaryAllowedWorkplaces = [],
    moduleKey: parentModuleKey = '',
    moduleLabel,
    userIdField,
    branchIdField,
    companyIdField,
    dateField = [],
    emailField = [],
    imagenameField = [],
    imageIdField = '',
    imageFolder = '',
    printEmpField = [],
    printCustField = [],
    totalCurrencyFields = [],
    totalAmountFields = [],
    signatureFields = [],
    headerFields = [],
    mainFields = [],
    footerFields = [],
    viewSource = {},
    transactionTypeField = '',
    transactionTypeValue = '',
    detectFields = [],
    detectField = '',
    procedures = [],
    temporaryProcedures = [],
    supportsTemporarySubmission,
    allowTemporarySubmission,
    posApiEnabled = false,
    posApiType = '',
    posApiTypeField = '',
    posApiEndpointId = '',
    posApiInfoEndpointIds = [],
    fieldsFromPosApi = [],
    infoEndpoints = [],
    posApiMapping = {},
    infoEndpointMappings = {},
  } = config || {};
  const uid = arrify(userIdFields.length ? userIdFields : userIdField ? [userIdField] : []);
  const bid = arrify(
    branchIdFields.length ? branchIdFields : branchIdField ? [branchIdField] : [],
  );
  const cid = arrify(
    companyIdFields.length ? companyIdFields : companyIdField ? [companyIdField] : [],
  );
  const ab = Array.isArray(allowedBranches)
    ? allowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const ad = Array.isArray(allowedDepartments)
    ? allowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const aur = normalizeMixedAccessList(allowedUserRights);
  const aw = normalizeMixedAccessList(allowedWorkplaces);
  const tab = Array.isArray(temporaryAllowedBranches)
    ? temporaryAllowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const tad = Array.isArray(temporaryAllowedDepartments)
    ? temporaryAllowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const taur = normalizeMixedAccessList(temporaryAllowedUserRights);
  const taw = normalizeMixedAccessList(temporaryAllowedWorkplaces);
  const tempProcedures = Array.isArray(temporaryProcedures)
    ? temporaryProcedures
        .map((proc) => (typeof proc === 'string' ? proc.trim() : ''))
        .filter((proc) => proc)
    : [];
  const { cfg } = await readConfig(companyId);
  if (!cfg[table]) cfg[table] = {};
  cfg[table][name] = {
    visibleFields: arrify(visibleFields),
    requiredFields: arrify(requiredFields),
    defaultValues,
    editableDefaultFields: arrify(editableDefaultFields),
    editableFields: arrify(editableFields),
    userIdFields: uid,
    branchIdFields: bid,
    companyIdFields: cid,
    dateField: arrify(dateField),
    emailField: arrify(emailField),
    imagenameField: arrify(imagenameField),
    imageIdField: imageIdField || '',
    imageFolder: imageFolder || '',
    printEmpField: arrify(printEmpField),
    printCustField: arrify(printCustField),
    totalCurrencyFields: arrify(totalCurrencyFields),
    totalAmountFields: arrify(totalAmountFields),
    signatureFields: arrify(signatureFields),
    headerFields: arrify(headerFields),
    mainFields: arrify(mainFields),
    footerFields: arrify(footerFields),
    viewSource: viewSource && typeof viewSource === 'object' ? viewSource : {},
    transactionTypeField: transactionTypeField || '',
    transactionTypeValue: transactionTypeValue || '',
    detectFields: arrify(
      detectFields.length ? detectFields : detectField ? [detectField] : [],
    ),
    moduleKey: parentModuleKey,
    moduleLabel: moduleLabel || undefined,
    allowedBranches: ab,
    allowedDepartments: ad,
    allowedUserRights: aur,
    allowedWorkplaces: aw,
    temporaryAllowedBranches: tab,
    temporaryAllowedDepartments: tad,
    temporaryAllowedUserRights: taur,
    temporaryAllowedWorkplaces: taw,
    procedures: arrify(procedures),
    temporaryProcedures: tempProcedures,
    allowTemporarySubmission: Boolean(
      supportsTemporarySubmission ?? allowTemporarySubmission ?? false,
    ),
    supportsTemporarySubmission: Boolean(
      supportsTemporarySubmission ?? allowTemporarySubmission ?? false,
    ),
    posApiEnabled: Boolean(posApiEnabled),
    posApiType:
      typeof posApiType === 'string' && posApiType.trim()
        ? posApiType.trim()
        : '',
    posApiTypeField:
      typeof posApiTypeField === 'string' ? posApiTypeField.trim() : '',
    posApiEndpointId:
      typeof posApiEndpointId === 'string' && posApiEndpointId.trim()
        ? posApiEndpointId.trim()
        : '',
    posApiInfoEndpointIds: Array.isArray(posApiInfoEndpointIds)
      ? Array.from(
          new Set(
            posApiInfoEndpointIds
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value),
          ),
        )
      : [],
    infoEndpoints: Array.isArray(infoEndpoints)
      ? Array.from(
          new Set(
            infoEndpoints
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value),
          ),
        )
      : [],
    fieldsFromPosApi: Array.isArray(fieldsFromPosApi)
      ? Array.from(
          new Set(
            fieldsFromPosApi
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value),
          ),
        )
      : [],
    posApiMapping: sanitizePosApiMapping(posApiMapping),
    infoEndpointMappings: sanitizeInfoEndpointMappings(infoEndpointMappings),
  };
  if (editableFields !== undefined) {
    cfg[table][name].editableFields = arrify(editableFields);
  }
  await writeConfig(cfg, companyId);
  return cfg[table][name];
}

export async function deleteFormConfig(table, name, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (!cfg[table] || !cfg[table][name]) return;
  delete cfg[table][name];
  if (Object.keys(cfg[table]).length === 0) delete cfg[table];
  await writeConfig(cfg, companyId);
}

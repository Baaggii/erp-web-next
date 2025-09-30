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

function parseEntry(raw = {}) {
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
    moduleLabel: typeof raw.moduleLabel === 'string' ? raw.moduleLabel : '',
    procedures: arrify(raw.procedures || raw.procedure),
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
  { moduleKey, branchId, departmentId } = {},
  companyId = 0,
) {
  const { cfg, isDefault } = await readConfig(companyId);
  const result = {};
  const bId = branchId ? Number(branchId) : null;
  const dId = departmentId ? Number(departmentId) : null;
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const [name, info] of Object.entries(names)) {
      const parsed = parseEntry(info);
      const modKey = parsed.moduleKey;
      const allowed = parsed.allowedBranches;
      const deptAllowed = parsed.allowedDepartments;
      if (moduleKey && moduleKey !== modKey) continue;
      if (bId != null && allowed.length > 0 && !allowed.includes(bId)) continue;
      if (dId != null && deptAllowed.length > 0 && !deptAllowed.includes(dId)) continue;
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
    procedures: arrify(procedures),
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

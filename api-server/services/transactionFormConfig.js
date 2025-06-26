import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'transactionForms.json');

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeConfig(cfg) {
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function parseEntry(raw = {}) {
  return {
    visibleFields: raw.visibleFields || [],
    requiredFields: raw.requiredFields || [],
    defaultValues: raw.defaultValues || {},
    editableDefaultFields: raw.editableDefaultFields || [],
    userIdFields: raw.userIdFields || (raw.userIdField ? [raw.userIdField] : []),
    branchIdFields:
      raw.branchIdFields || (raw.branchIdField ? [raw.branchIdField] : []),
    companyIdFields:
      raw.companyIdFields || (raw.companyIdField ? [raw.companyIdField] : []),
    moduleKey: typeof raw.moduleKey === 'string' ? raw.moduleKey : '',
    allowedBranches: Array.isArray(raw.allowedBranches)
      ? raw.allowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    allowedDepartments: Array.isArray(raw.allowedDepartments)
      ? raw.allowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    moduleLabel: typeof raw.moduleLabel === 'string' ? raw.moduleLabel : '',
    dateField: typeof raw.dateField === 'string' ? raw.dateField : '',
    transactionTypeField:
      typeof raw.transactionTypeField === 'string'
        ? raw.transactionTypeField
        : '',
    transactionTypeValue:
      typeof raw.transactionTypeValue === 'string'
        ? raw.transactionTypeValue
        : '',
    imageNameFields: Array.isArray(raw.imageNameFields)
      ? raw.imageNameFields
      : [],
  };
}

export async function getFormConfig(table, name) {
  const cfg = await readConfig();
  const byTable = cfg[table] || {};
  const raw = byTable[name];
  return parseEntry(raw);
}

export async function getConfigsByTable(table) {
  const cfg = await readConfig();
  const byTable = cfg[table] || {};
  const result = {};
  for (const [name, info] of Object.entries(byTable)) {
    result[name] = parseEntry(info);
  }
  return result;
}

export async function listTransactionNames({ moduleKey, branchId, departmentId } = {}) {
  const cfg = await readConfig();
  const result = {};
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const [name, info] of Object.entries(names)) {
      const parsed = parseEntry(info);
      const modKey = parsed.moduleKey;
      const allowed = parsed.allowedBranches;
      const deptAllowed = parsed.allowedDepartments;
      if (moduleKey && moduleKey !== modKey) continue;
      if (branchId && allowed.length > 0 && !allowed.includes(Number(branchId))) continue;
      if (departmentId && deptAllowed.length > 0 && !deptAllowed.includes(Number(departmentId))) continue;
      result[name] = { table: tbl, ...parsed };
    }
  }
  return result;
}

export async function setFormConfig(table, name, config, options = {}) {
  const {
    visibleFields = [],
    requiredFields = [],
    defaultValues = {},
    editableDefaultFields = [],
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
    dateField,
    transactionTypeField,
    transactionTypeValue,
    imageNameFields = [],
  } = config || {};
  const uid = (userIdFields.length ? userIdFields : userIdField ? [userIdField] : [])
    .map(String)
    .filter(Boolean);
  const bid = (branchIdFields.length
    ? branchIdFields
    : branchIdField
    ? [branchIdField]
    : [])
    .map(String)
    .filter(Boolean);
  const cid = (companyIdFields.length
    ? companyIdFields
    : companyIdField
    ? [companyIdField]
    : [])
    .map(String)
    .filter(Boolean);
  const ab = Array.isArray(allowedBranches)
    ? allowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const ad = Array.isArray(allowedDepartments)
    ? allowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const cfg = await readConfig();
  if (!cfg[table]) cfg[table] = {};
  cfg[table][name] = {
    visibleFields,
    requiredFields,
    defaultValues,
    editableDefaultFields,
    userIdFields: uid,
    branchIdFields: bid,
    companyIdFields: cid,
    moduleKey: parentModuleKey,
    moduleLabel: moduleLabel || undefined,
    allowedBranches: ab,
    allowedDepartments: ad,
    dateField: typeof dateField === 'string' ? dateField : undefined,
    transactionTypeField:
      typeof transactionTypeField === 'string' ? transactionTypeField : undefined,
    transactionTypeValue:
      typeof transactionTypeValue === 'string' ? transactionTypeValue : undefined,
    imageNameFields: Array.isArray(imageNameFields) ? imageNameFields : undefined,
  };
  await writeConfig(cfg);
  return cfg[table][name];
}

export async function deleteFormConfig(table, name) {
  const cfg = await readConfig();
  if (!cfg[table] || !cfg[table][name]) return;
  delete cfg[table][name];
  if (Object.keys(cfg[table]).length === 0) delete cfg[table];
  await writeConfig(cfg);
}

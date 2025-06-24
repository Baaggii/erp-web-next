import fs from 'fs/promises';
import path from 'path';
import { upsertModule } from '../../db/index.js';

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
    moduleKey: typeof raw.moduleKey === 'string' ? raw.moduleKey : 'finance_transactions',
    allowedBranches: Array.isArray(raw.allowedBranches)
      ? raw.allowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    allowedDepartments: Array.isArray(raw.allowedDepartments)
      ? raw.allowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
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
    userIdField,
    branchIdField,
    companyIdField,
  } = config || {};
  const {
    showInSidebar = true,
    showInHeader = false,
    moduleKey = 'finance_transactions',
  } = options;
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
    moduleKey,
    allowedBranches: ab,
    allowedDepartments: ad,
  };
  await writeConfig(cfg);
  try {
    await upsertModule(moduleKey, moduleKey.replace(/_/g, ' '), null, true, false);
  } catch (err) {
    console.error('Failed to auto-create module', err);
  }
  return cfg[table][name];
}

export async function deleteFormConfig(table, name) {
  const cfg = await readConfig();
  if (cfg[table]) {
    delete cfg[table][name];
    if (Object.keys(cfg[table]).length === 0) delete cfg[table];
    await writeConfig(cfg);
  }
}

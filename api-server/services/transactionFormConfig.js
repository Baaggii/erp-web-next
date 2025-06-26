import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '..', '..', 'config', 'transactionForms.json');

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

// Base configuration structure. New properties can be added here without
// modifying parsing or persistence logic. Unknown fields will be ignored when
// saving configurations.
const DEFAULT_ENTRY = {
  visibleFields: [],
  requiredFields: [],
  defaultValues: {},
  editableDefaultFields: [],
  userIdFields: [],
  branchIdFields: [],
  companyIdFields: [],
  moduleKey: '',
  moduleLabel: '',
  allowedBranches: [],
  allowedDepartments: [],
  dateField: '',
  transactionTypeField: '',
  transactionTypeValue: '',
  imageNameFields: [],
};

function parseEntry(raw = {}) {
  const result = {};
  for (const [key, def] of Object.entries(DEFAULT_ENTRY)) {
    let value = raw[key];
    if (key === 'userIdFields') {
      value = value || (raw.userIdField ? [raw.userIdField] : []);
      result[key] = Array.isArray(value) ? value : [];
      continue;
    }
    if (key === 'branchIdFields') {
      value = value || (raw.branchIdField ? [raw.branchIdField] : []);
      result[key] = Array.isArray(value) ? value : [];
      continue;
    }
    if (key === 'companyIdFields') {
      value = value || (raw.companyIdField ? [raw.companyIdField] : []);
      result[key] = Array.isArray(value) ? value : [];
      continue;
    }
    if (key === 'allowedBranches' || key === 'allowedDepartments') {
      const arr = Array.isArray(value) ? value : [];
      result[key] = arr
        .map((v) => Number(v))
        .filter((v) => !Number.isNaN(v));
      continue;
    }
    if (Array.isArray(def)) {
      result[key] = Array.isArray(value) ? value : [];
      continue;
    }
    if (typeof def === 'object') {
      result[key] = value && typeof value === 'object' ? value : {};
      continue;
    }
    if (typeof def === 'string') {
      result[key] = typeof value === 'string' ? value : '';
      continue;
    }
    result[key] = value ?? def;
  }
  return result;
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
    userIdField,
    branchIdField,
    companyIdField,
    ...rest
  } = config || {};

  const entry = {};

  for (const [key, def] of Object.entries(DEFAULT_ENTRY)) {
    let value = rest[key];
    if (key === 'userIdFields') {
      value = value && value.length ? value : userIdField ? [userIdField] : [];
      entry[key] = Array.isArray(value)
        ? value.map(String).filter(Boolean)
        : [];
      continue;
    }
    if (key === 'branchIdFields') {
      value = value && value.length ? value : branchIdField ? [branchIdField] : [];
      entry[key] = Array.isArray(value)
        ? value.map(String).filter(Boolean)
        : [];
      continue;
    }
    if (key === 'companyIdFields') {
      value = value && value.length ? value : companyIdField ? [companyIdField] : [];
      entry[key] = Array.isArray(value)
        ? value.map(String).filter(Boolean)
        : [];
      continue;
    }
    if (key === 'allowedBranches' || key === 'allowedDepartments') {
      entry[key] = Array.isArray(value)
        ? value.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
        : [];
      continue;
    }
    if (key === 'moduleKey') {
      entry[key] = typeof value === 'string' ? value : '';
      continue;
    }
    if (key === 'moduleLabel') {
      entry[key] = typeof value === 'string' && value ? value : undefined;
      continue;
    }
    if (key === 'dateField' || key === 'transactionTypeField' || key === 'transactionTypeValue') {
      entry[key] = typeof value === 'string' && value !== '' ? value : undefined;
      continue;
    }
    if (key === 'imageNameFields') {
      entry[key] = Array.isArray(value) ? value : undefined;
      continue;
    }
    if (Array.isArray(def)) {
      entry[key] = Array.isArray(value) ? value : [];
      continue;
    }
    if (typeof def === 'object') {
      entry[key] = value && typeof value === 'object' ? value : {};
      continue;
    }
    if (typeof def === 'string') {
      entry[key] = typeof value === 'string' ? value : undefined;
      continue;
    }
    entry[key] = value ?? def;
  }

  const cfg = await readConfig();
  if (!cfg[table]) cfg[table] = {};
  cfg[table][name] = entry;
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

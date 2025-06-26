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
    printEmpField: arrify(raw.printEmpField),
    printCustField: arrify(raw.printCustField),
    totalCurrencyFields: arrify(raw.totalCurrencyFields),
    totalAmountFields: arrify(raw.totalAmountFields),
    signatureFields: arrify(raw.signatureFields),
    headerFields: arrify(raw.headerFields),
    mainFields: arrify(raw.mainFields),
    footerFields: arrify(raw.footerFields),
    transactionTypeField:
      typeof raw.transactionTypeField === 'string'
        ? raw.transactionTypeField
        : '',
    transactionTypeValue:
      typeof raw.transactionTypeValue === 'string'
        ? raw.transactionTypeValue
        : '',
    moduleKey: typeof raw.moduleKey === 'string' ? raw.moduleKey : '',
    allowedBranches: Array.isArray(raw.allowedBranches)
      ? raw.allowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    allowedDepartments: Array.isArray(raw.allowedDepartments)
      ? raw.allowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    moduleLabel: typeof raw.moduleLabel === 'string' ? raw.moduleLabel : '',
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
    dateField = [],
    emailField = [],
    imagenameField = [],
    printEmpField = [],
    printCustField = [],
    totalCurrencyFields = [],
    totalAmountFields = [],
    signatureFields = [],
    headerFields = [],
    mainFields = [],
    footerFields = [],
    transactionTypeField = '',
    transactionTypeValue = '',
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
  const cfg = await readConfig();
  if (!cfg[table]) cfg[table] = {};
  cfg[table][name] = {
    visibleFields: arrify(visibleFields),
    requiredFields: arrify(requiredFields),
    defaultValues,
    editableDefaultFields: arrify(editableDefaultFields),
    userIdFields: uid,
    branchIdFields: bid,
    companyIdFields: cid,
    dateField: arrify(dateField),
    emailField: arrify(emailField),
    imagenameField: arrify(imagenameField),
    printEmpField: arrify(printEmpField),
    printCustField: arrify(printCustField),
    totalCurrencyFields: arrify(totalCurrencyFields),
    totalAmountFields: arrify(totalAmountFields),
    signatureFields: arrify(signatureFields),
    headerFields: arrify(headerFields),
    mainFields: arrify(mainFields),
    footerFields: arrify(footerFields),
    transactionTypeField: transactionTypeField || '',
    transactionTypeValue: transactionTypeValue || '',
    moduleKey: parentModuleKey,
    moduleLabel: moduleLabel || undefined,
    allowedBranches: ab,
    allowedDepartments: ad,
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
